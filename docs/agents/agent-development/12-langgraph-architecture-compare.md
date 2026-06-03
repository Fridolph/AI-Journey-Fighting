# LangGraph 学习笔记（六）：Multi-Agent 架构对比与实战

> 衔接上篇：已掌握 Supervisor 多 Agent 调度
> 本篇目标：对比两种架构（全串行 Supervisor vs 混合并行），理解 Agent 的两种类型，跑通三 Agent 系统

## 一、第三章：升级为三 Agent 系统

在前一章双 Agent（天气 + 小知识）的基础上，本章引入第三个 Agent——**易经卦象 Agent**（`iching_agent`），实现了：

```
用户提问：查一下杭州的天气，再讲一条和杭州有关的小知识。

weather_agent  →  查询天气
trivia_agent   →  查询城市小知识
iching_agent   →  根据天气选易经卦象
summaryModel   →  整合成自然语言最终回答
```

## 二、Agent 的两种类型

本章实践了两种本质不同的 Agent：

| 类型 | 代表 | 特点 |
|---|---|---|
| **工具型 Agent** | `weather_agent` / `trivia_agent` | 必须调用外部工具获取数据，LLM 不知道实时信息 |
| **纯推理型 Agent** | `iching_agent` | `tools: []`，直接利用 LLM 训练数据推理，无需外部工具 |

> **核心判断原则**：如果数据是 LLM 训练集里有的（易经、历史、常识），就用纯推理；如果是实时数据或私有数据（天气、股票、数据库查询），就必须用工具。

### iching_agent 的选卦规则

```js
const ichingAgent = createAgent({
  name: "iching_agent",
  description: "根据城市和当前天气，从易经六十四卦中选出最契合的一卦及爻辞。",
  model,
  tools: [],  // 纯推理，不需要任何工具
  systemPrompt: `
选卦原则：
1. 优先选与天气意象直接相关的卦：
   雨未降、云积聚 → 小畜卦"密云不雨"
   雷雨大作 → 解卦、震卦
   晴空万里 → 乾卦
   云雾迷蒙 → 蒙卦
   等待时机 → 需卦
2. 爻辞必须是易经原文，不要自行创作。
3. 含义结合城市和天气，有意境，一句话即可。
4. 按固定格式输出：卦象：xxx / 爻辞：xxx / 含义：xxx
`,
})
```

### 踩坑：不要为 LLM 已知知识设计工具

最初为 `iching_agent` 设计了一个天气→卦象映射表作为工具，但实际运行发现模型完全忽略了它，直接用自己的易经知识推理，而且推理质量更高。

**教训**：工具的价值在于提供 **LLM 不知道的数据**。易经是训练数据里有的知识，`tools: []` 纯推理反而更好。

## 三、架构一：全串行 Supervisor

```
supervisor → weather_agent → supervisor → trivia_agent → supervisor → iching_agent → supervisor
```

```js
const workflow = createSupervisor({
  agents: [weatherAgent.graph, triviaAgent.graph, ichingAgent.graph],
  llm: supervisorModel,
  prompt: `
严格串行调度顺序（不可更改）：
第一步：调用 weather_agent。
第二步：weather_agent 完成后，调用 trivia_agent。
第三步：trivia_agent 完成后，调用 iching_agent。
第四步：iching_agent 完成后，立即结束。
`,
})
```

运行效果：

```
路径: supervisor → weather_agent → supervisor → trivia_agent → supervisor → iching_agent → supervisor
耗时: ~10822ms

[weather_agent]  杭州今天多云转小雨，气温15～22°C，空气质量良。
[trivia_agent]   西湖文化景观是世界文化遗产之一。
[iching_agent]   卦象：小畜卦 / 爻辞：密云不雨，自我西郊 / 含义：雨意已蓄，宜静观其变。
```

- **优点**：调度逻辑全由 `createSupervisor` 自动管理
- **缺点**：每个 Agent 之间都有 supervisor LLM 调度开销，三轮调度叠加导致总耗时 ~10s

## 四、架构二：混合并行 + 串行

```
weather_agent ──┐
                ├─ [并行] ──→ iching_agent（依赖天气）─→ summaryModel
trivia_agent  ──┘
```

weather 和 trivia 无依赖关系，可以并行执行；iching 依赖天气结果，必须串行。

```js
// Step 1：并行
const [weatherRes, triviaRes] = await Promise.all([
  weatherAgent.invoke(input),
  triviaAgent.invoke(input),
])

// Step 2：串行（iching 依赖天气结果）
const ichingRes = await ichingAgent.invoke(ichingInput)

// Step 3：整合
const finalAnswer = await summarizeResults({ ... })
```

运行效果：

```
Step 1 并行（weather + trivia）：1801ms
Step 2 串行（iching）          ：1135ms
Step 3 整合（summary）         ：1279ms
总计                           ：4215ms
```

对比全串行版 **10822ms → 4215ms**，节省约 **60%**。

## 五、两种架构对比

| 维度 | 全串行 Supervisor | 混合并行 |
|------|------------------|---------|
| 调度方式 | `createSupervisor` 自动调度 | 手动 `Promise.all` + 串行调用 |
| Agent 间开销 | 每次切换有 supervisor LLM 开销 | 无开销（直接 invoke） |
| 并行能力 | 不支持（`parallel_tool_calls: false`） | weather + trivia 并行 |
| 总耗时（三 Agent） | ~10s | ~4s |
| 灵活性 | 高（supervisor 可动态决策） | 低（调度逻辑硬编码） |
| 调试难度 | 中（需理解 supervisor 内部消息流） | 低（每一步都是显式调用） |

### 选择指南

| 场景 | 推荐 |
|------|------|
| Agent 之间有复杂依赖、需动态决策调度顺序 | 全串行 Supervisor |
| Agent 无依赖、调度顺序固定、追求性能 | 混合并行 |
| Agent 数量少（2~3 个）、关系清晰 | 混合并行 |
| Agent 数量多、未来可能扩展 | 全串行 Supervisor（扩展更灵活） |

## 六、封装函数模式

两个版本最终都收敛到相同的封装模式：

```js
// 提取工具函数
function extractAgentResults(finalState) {
  // 从 finalState.messages 中按 name 字段分组提取各 Agent 输出
  // 兼容 name 字段不存在的兜底逻辑
}

// 总结工具函数
async function summarizeResults({ userQuestion, weatherResult, triviaResult, ichingResult }) {
  // 独立调用 summaryModel，不进 Supervisor 图
  // 将多个 Agent 输出融合成一段自然语言
}
```

**封装后的主流程极简洁：**

```js
const { weatherResult, triviaResult, ichingResult } = extractAgentResults(finalState)
const finalAnswer = await summarizeResults({ userQuestion, weatherResult, triviaResult, ichingResult })
```

## 七、DeepSeek 兼容的三个关键配置

在使用 DeepSeek 系列模型时，以下三个配置缺一不可：

```js
// 子 Agent 模型
modelKwargs: { thinking: { type: "disabled" } }    // ① 避免 reasoning_content 污染消息链

// Supervisor 专用模型
modelKwargs: {
  thinking: { type: "disabled" },
  parallel_tool_calls: false                       // ② 禁止并行 tool_calls
}

// ③ ChatOpenAI 没有 .bind()，必须重新 new 创建 supervisorModel
```

## 八、架构总览图

```
┌─────────────────────────────────────────────────┐
│                  用户输入                        │
└────────────────────┬────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │ Promise.all（并行）      │
        ▼                         ▼
 weather_agent              trivia_agent
 lookup_weather 工具        lookup_city_trivia 工具
 → 天气数据                 → 城市小知识
        │                         │
        └────────────┬────────────┘
                     │ 天气结果传入
                     ▼
               iching_agent
               纯推理（tools: []）
               → 卦象 + 爻辞 + 含义
                     │
                     ▼
               summaryModel
               独立整合（不进 graph）
                     │
                     ▼
                 最终回答
```

## 九、LangGraph 学习全景

| 篇目 | 主题 | 核心能力 |
|------|------|---------|
| 01 热身 | 图的概念推导 | Node / Edge / Conditional Edge / Back Edge / State / Thread |
| 02 从图到代码 | API 映射 + Checkpointer | StateAnnotation / reducer / MessagesAnnotation / MemorySaver |
| 03 interrupt | 暂停机制 | interrupt() / Command({ resume }) / 多 interrupt 流程 |
| 04 prebuilt Agent | 白盒拆解 + 黑盒封装 | `ToolNode` / `toolsCondition` / `createReactAgent` |
| 05 Multi-Agent | Supervisor 调度 | `createSupervisor` / 三模型架构 / 串行调度 |
| 06 架构对比 | 全串行 vs 混合并行 | `Promise.all` 并行 / 手动调度 / 优化代码 |

> 核心原则：**让每个 Agent 只做一件事，能并行就并行，不得不串行的才串行，summaryModel 不进图——职责分离是多 Agent 系统稳定运行的根本。**
