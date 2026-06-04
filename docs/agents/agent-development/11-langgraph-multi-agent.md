# LangGraph 学习笔记（五）：Multi-Agent Supervisor

> 衔接上篇：已掌握 prebuilt Agent 的白盒拆解和黑盒封装
> 本篇目标：掌握 Supervisor 多 Agent 调度——让一个"主管"分派任务给多个专业 Agent

## 一、什么是 Supervisor 模式？

Supervisor（主管）模式是 LangGraph 多 Agent 架构的核心：一个专门的调度节点负责把用户任务分派给不同的子 Agent，等子 Agent 完成后收回结果，再决定下一步。

```
用户：「查一下杭州的天气，再讲一条杭州的小知识」
  ↓
[supervisor] 分析任务：需要两个子 Agent
  ↓
[weather_agent] 调用天气工具 → 返回天气数据
  ↓
[supervisor] 收到天气结果，发现还有小知识没完成
  ↓
[trivia_agent] 调用城市小知识工具 → 返回小知识
  ↓
[supervisor] 所有任务完成 → 结束
  ↓
单独 summaryModel 整合最终回答
```

### 为什么不把 summary 放进 Supervisor 图？

如果把 `summary_agent` 作为无工具 Agent 加入 Supervisor 图，容易触发 `INVALID_TOOL_RESULTS`——原因是 Supervisor 通过 `tool_calls` 调度子 Agent，无工具的 Agent 可能收到不完整的 tool call 消息链。因此当前稳定方案是 summaryModel 在图执行完成后独立调用。

## 二、核心架构：三个模型各司其职

```js
// ① 基础模型：给子 Agent 使用
const model = new ChatOpenAI({
  modelKwargs: { thinking: { type: "disabled" } },  // DeepSeek 兼容
})

// ② Supervisor 专用模型：关闭并行 tool calls
const supervisorModel = new ChatOpenAI({
  modelKwargs: {
    thinking: { type: "disabled" },
    parallel_tool_calls: false,  // ⚠️ 关键：禁止同时调用多个 agent
  },
})

// ③ 最终总结模型：不参与 tool call，只负责整合文本
const summaryModel = new ChatOpenAI({})
```

| 模型 | 职责 | 配置重点 |
|---|---|---|
| `model` | 子 Agent（天气/小知识）使用 | `thinking.disabled` |
| `supervisorModel` | Supervisor 调度使用 | `thinking.disabled` + `parallel_tool_calls: false` |
| `summaryModel` | 最终整合回答 | 无需特殊配置，不进 Supervisor 图 |

## 三、子 Agent 定义

```js
const weatherAgent = createAgent({
  name: "weather_agent",
  description: "专门查天气、气温、下不下雨、空气质量。",
  model,
  tools: [lookupWeatherTool],
  systemPrompt: `
你是 weather_agent，只负责天气相关问题。

规则：
1. 必须调用 lookup_weather 查询天气。
2. 只基于工具返回内容回答。
3. 如果用户问题里还包含城市小知识、历史、名胜，直接忽略。
4. 不要说"我无法回答小知识"，不要解释职责边界。
5. 只输出天气数据本身，不要给出穿衣、出行、雨具等建议。
6. 中文简短回答。
`,
})

const triviaAgent = createAgent({
  name: "trivia_agent",
  description: "专门讲与城市相关的小知识、名胜、历史、一句介绍。",
  model,
  tools: [lookupCityTriviaTool],
  systemPrompt: `
你是 trivia_agent，只负责城市小知识相关问题。

规则：
1. 必须调用 lookup_city_trivia 查询城市小知识。
2. 只基于工具返回内容回答。
3. 如果用户问题里还包含天气、气温、空气质量，直接忽略。
4. 不要说"我无法回答天气"，不要解释职责边界。
5. 直接输出小知识内容，不要说"给您查到了"。
6. 中文简短回答。
`,
})
```

**Agent prompt 的核心原则：**
- 职责明确（天气就只做天气，小知识就只做小知识）
- 不要解释"我不能做什么"（浪费输出，干扰后续总结）
- 输出要干净（只给数据和事实，润色交给 summaryModel）

## 四、Supervisor 定义

```js
import { createSupervisor } from "@langchain/langgraph-supervisor"

const workflow = createSupervisor({
  agents: [weatherAgent.graph, triviaAgent.graph],
  llm: supervisorModel,
  prompt: `
你是 supervisor 调度员，只负责选择合适的 agent，不负责回答业务内容。

可用 agent：
- weather_agent：负责天气、气温。
- trivia_agent：负责城市小知识、名胜、历史。

严格调度规则：
1. 每次只能调用一个 agent。
2. 禁止在同一轮中同时调用多个 agent。
3. 禁止并行调用 agent。
4. 如果用户同时问了天气和小知识，必须严格分两步：
    第一步：调用 weather_agent。
    第二步：等 weather_agent 完成后，再调用 trivia_agent。
5. weather_agent 和 trivia_agent 都完成后，立即结束。
6. 你自己不要报天气，不要讲城市百科，不要总结业务内容。
7. 不要重复调用已经完成的 agent。
`,
})
```

## 五、执行与结果提取

```js
const app = workflow.compile()

// 流式执行，同时追踪路径
const nodePath = []
let finalState = null
const stream = await app.stream(input, { streamMode: ["updates", "values"] })
for await (const event of stream) {
  const [mode, payload] = event
  if (mode === "updates") nodePath.push(...Object.keys(payload))
  if (mode === "values") finalState = payload
}
console.log("路径:", nodePath.join(" → "))
// 输出: supervisor → weather_agent → supervisor → trivia_agent → supervisor

// 从 finalState 提取各 Agent 的有效回答
const messages = finalState?.messages ?? []
const validAIMessages = messages.filter(msg =>
  msg?.getType?.() === "ai" &&
  typeof msg.content === "string" &&
  msg.content.trim().length > 0 &&
  (!Array.isArray(msg.tool_calls) || msg.tool_calls.length === 0)
)

// 按 name 分组（兜底按顺序取第一个 weather 第二个 trivia）
const weatherMsgs = validAIMessages.filter(m => (m.name ?? "") === "weather_agent")
const triviaMsgs  = validAIMessages.filter(m => (m.name ?? "") === "trivia_agent")
const weatherResult = weatherMsgs.at(-1)?.content ?? validAIMessages[0]?.content
const triviaResult  = triviaMsgs.at(-1)?.content  ?? validAIMessages[1]?.content
```

## 六、独立总结

```js
const summaryPrompt = `
你是最终回答整合员。

用户原始问题：${userQuestion}

weather_agent 的结果：${weatherResult}
trivia_agent 的结果：${triviaResult}

请把两个结果整合成一段自然、流畅、有温度的中文回答。
要求：
1. 不要机械拼接。
2. 不要出现 "weather_agent" "trivia_agent" 等字样。
3. 不要分成两个割裂的段落。
4. 不要编造任何没有提供的信息。
`

const summaryResponse = await summaryModel.invoke([new HumanMessage(summaryPrompt)])
const finalAnswer = summaryResponse.content
```

## 七、已攻克的 Bug 清单

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 1 | `INVALID_TOOL_RESULTS` | Supervisor 并行调用了多个 agent，tool_calls 和 ToolMessage 对不上 | `parallel_tool_calls: false` + prompt 串行约束 |
| 2 | `model.bind is not a function` | `ChatOpenAI` 没有 `.bind()` 方法 | 新建 `supervisorModel` 实例，用 `modelKwargs` 传参 |
| 3 | DeepSeek thinking 报错 | DeepSeek 模型返回 reasoning_content 格式不兼容 | `modelKwargs: { thinking: { type: "disabled" } }` |
| 4 | Agent 输出职责边界废话 | weather_agent 说"我无法回答小知识" | prompt 中明确："不要说我无法回答X，不要解释职责边界" |
| 5 | 最终回答机械拼接 | 直接拼接两个 Agent 输出 | 引入独立 summaryModel 做自然融合 |

## 八、当前运行效果

```
路径: supervisor → weather_agent → supervisor → trivia_agent → supervisor

─── 过程输出 ───
[weather_agent]
杭州今天多云转小雨，气温15～22°C，空气质量良。

[trivia_agent]
西湖文化景观是世界文化遗产之一。

─── 最终回答 ───
杭州今天多云转小雨，气温在15到22℃之间，空气质量良。
说到杭州就不得不提它最有名的西湖——西湖文化景观已被列入世界文化遗产，
是这座城市最闪亮的人文名片之一。
```

## 九、后续优化方向

### 1. 让子 Agent 输出更干净
- weather_agent：去掉出行/雨具建议，只输出天气数据
- trivia_agent：去掉"给您查到了"等客套话
- 所有润色和表达统一交给 summaryModel

### 2. 封装可复用函数
- `extractAgentResults(finalState)` → 从消息中提取各 Agent 结果
- `summarizeResults({ summaryModel, userQuestion, ...results })` → 独立总结

### 3. 格式化过程输出
```
📍 执行路径
supervisor → weather_agent → supervisor → trivia_agent → supervisor

🧩 Agent 过程
1. weather_agent：杭州今天多云转小雨，气温15～22°C。
2. trivia_agent：西湖文化景观是世界文化遗产之一。

✅ 最终回答
杭州今天多云转小雨...
```

### 4. 升级为结构化 JSON 输出
让工具返回 JSON 格式，summaryModel 的输入更稳定可控。

## 十、LangGraph 学习全景

| 篇目 | 主题 | 核心能力 |
|------|------|---------|
| 01 热身 | 图的概念推导 | Node / Edge / Conditional Edge / Back Edge / State / Thread |
| 02 从图到代码 | API 映射 + Checkpointer | StateAnnotation / reducer / MessagesAnnotation / MemorySaver |
| 03 interrupt | 暂停机制 | interrupt() / Command({ resume }) / 多 interrupt 流程 |
| 04 prebuilt Agent | 白盒拆解 + 黑盒封装 | `ToolNode` / `toolsCondition` / `createReactAgent` / 消息流追踪 |
| 05 Multi-Agent | Supervisor 调度 | `createSupervisor` / 三模型架构 / 串行调度 / 独立总结 |
