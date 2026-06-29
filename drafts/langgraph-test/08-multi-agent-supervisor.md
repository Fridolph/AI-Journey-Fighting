# 08 — Multi-Agent Supervisor：调度员模式

> 学习日期：2026-05-21
> 原始文件：`examples/langgraph-test/src/multi-agent-supervisor.mjs`
> 修复版：`examples/langgraph-test/src/multi-agent-supervisor-fix.mjs`

---

## 一、学习目标

- 理解 **Supervisor（调度员）模式**——一个 LLM 负责分配任务，多个专业子 Agent 各自处理
- 掌握 `createSupervisor` + `createReactAgent` 的配合使用
- 查缺补漏：本次遇到了两个兼容性问题并成功修复

---

## 二、Supervisor 模式的本质

### 2.1 结构

```
                    ┌── weather_agent（天气）
 用户 → supervisor ─┼── trivia_agent（小知识）
                    └── ...
```

**Supervisor 就是一个"会分任务的 LLM"。** 它不自己做业务，而是通过 `tool_calls` 调用"handoff 工具"（`transfer_to_weather_agent` / `transfer_to_trivia_agent`），把任务转给专业子 Agent。

### 2.2 图拓扑

```
START → supervisor
          │
          ├── weather_agent → supervisor (回来再判断)
          ├── trivia_agent  → supervisor (回来再判断)
          └── END
```

每个子 Agent 执行完后回到 supervisor，由 supervisor 再判断是否继续。

---

## 三、核心代码拆解

### 3.1 子 Agent：createReactAgent

```js
const weatherAgent = createReactAgent({
  name: "weather_agent",     // ★ 必须传 name，supervisor 用它识别
  llm: model,                // ★ 参数名 llm（不是 model）
  tools: [lookupWeatherTool],
  systemPrompt: "你只处理天气...",
});
```

每个子 Agent 是一个完整的 ReAct Agent——有自己的 LLM + tools。它可以独立运行，也可以被 supervisor 调度。

### 3.2 Supervisor：createSupervisor

```js
const workflow = createSupervisor({
  agents: [weatherAgent, triviaAgent],  // ★ 直接传 agent 实例
  llm: model,
  prompt: `你是调度员，只负责选人...`,    // supervisor 的 system prompt
  outputMode: "full_history",           // ★ 子 Agent 看到完整上下文
  addHandoffBackMessages: false,        // ★ 关键：避免 tool_call 配对问题
});
```

`createSupervisor` 内部做了三件事：
1. 为每个子 Agent 创建一个 **handoff 工具**（`transfer_to_weather_agent`）
2. 创建一个 **supervisor LLM**（绑定所有 handoff 工具）
3. 搭建 **图结构**：supervisor → 子 Agent → supervisor → ...

### 3.3 发送 handoff

当 supervisor 的 LLM 返回 `tool_call(name: "transfer_to_weather_agent")` 时，框架自动：
1. 执行 handoff 工具 → 返回 ToolMessage("Successfully transferred to weather_agent")
2. 路由到 `weather_agent` 节点
3. 子 Agent 运行完成 → 回到 supervisor
4. supervisor 再次判断是否需要继续

---

## 四、踩坑记录（重要）

### 问题 ①：createAgent（旧 API）与 createSupervisor 不兼容

原文件使用 `createAgent` from `"langchain"`（旧 API）创建子 Agent。`createSupervisor` 期望接收的是 `createReactAgent` from `"@langchain/langgraph/prebuilt"` 的输出。

| 对比 | createAgent（旧） | createReactAgent（新） |
|------|-----------------|----------------------|
| import | `from "langchain"` | `from "@langchain/langgraph/prebuilt"` |
| 参数名 | `model` | `llm` |
| 传给 supervisor | `agent.graph` | 直接传 agent 实例 |
| 兼容性 | ❌ | ✅ |

**报错信息：**
```
BadRequestError: 400 An assistant message with 'tool_calls' must be followed by 
tool messages responding to each 'tool_call_id'.
```

### 问题 ②：thinking 模型返回 reasoning_content

`.env` 中的 `MODEL_NAME=deepseek-v4-flash` 是一个 thinking 模型，会额外返回 `reasoning_content` 字段。当 LangGraph 把这个消息传回 DeepSeek API 时，不包含 `reasoning_content`，触发错误：

```
BadRequestError: 400 The `reasoning_content` in the thinking mode must be passed 
back to the API.
```

**修复：** 在代码中直接覆写模型名为 `"deepseek-chat"`（非 thinking 模型）。

### 问题 ③：handoff 回执干扰 tool_call 配对

默认 `addHandoffBackMessages: true` 时，每次子 Agent 返回后 supervisor 会插入一个 handoff ToolMessage。这些额外的 ToolMessage 会干扰后面子 Agent 的 tool_call/ToolMessage 配对。

**修复：** `addHandoffBackMessages: false`

### 问题 ④：outputMode 影响子 Agent 上下文

默认 `outputMode: "last_message"` 只传子 Agent 的最后一条消息，导致子 Agent 看不到用户原始问题。子 Agent 可能只回复"已转接"而不真正调工具。

**修复：** `outputMode: "full_history"` — 子 Agent 能看到完整消息历史。

---

## 五、运行验证

```bash
cd examples/langgraph-test
node src/multi-agent-supervisor-fix.mjs
```

**预期输出结构：**

```
── 执行路径（总消息数: 12）──
  0: [human] 杭州今天天气怎么样？
  1: [ai] [tc] 用户问天气 → 转给 weather_agent
  2: [tool] Successfully transferred to weather_agent
  3: [ai] [tc] weather_agent 调用 lookup_weather
  4: [tool] {"city":"杭州","summary":"多云转小雨",...}
  5: [ai] 杭州今天多云转小雨，15~22°C...   ← 这是最终回答
```

---

## 六、核心洞察

### 🔑 Supervisor 模式 = "会分任务的 LLM"

Supervisor 不自己做业务，它通过 `tool_calls` 分配任务。每个子 Agent 是独立的 ReAct Agent，可以有自己的 LLM、tools、system prompt。

```
人问 → supervisor 判断 → 天气？ → weather_agent → 查数据 → 回 supervisor → 结束
                       → 知识？ → trivia_agent  → 查数据 → 回 supervisor → 结束
```

### 🔑 子 Agent 是完整实例

子 Agent 可以独立运行。debug 时可以先单独调子 Agent：

```js
const result = await weatherAgent.invoke({
  messages: [new HumanMessage("杭州天气？")]
});
```

确认子 Agent 工作正常后再挂到 supervisor 下。

### 🔑 当前限制

`@langchain/langgraph-supervisor` v1.0.4 + `deepseek-chat` 顺序调用多个子 Agent 时有兼容问题。单次路由正常工作。

如果业务需要"查天气 + 查知识"的多任务查询，当前有两种方案：
1. 合并到单个 Agent 的 tools 中（可靠但无调度分层）
2. 手写 `StateGraph` 做 Supervisor（灵活但有深度兼容性要求）

---

## 七、学习注释版

| 文件 | 说明 |
|------|------|
| `src/multi-agent-supervisor.mjs` | 原始文件（旧 API，有 bug） |
| `src/multi-agent-supervisor-fix.mjs` | 修复版（4 处修复，单次路由可运行） |

---

## 八、踩坑总结表

| # | 问题 | 表现 | 修复 |
|---|------|------|------|
| ① | `createAgent` 旧 API | `400 tool_calls` 错误 | `createReactAgent` |
| ② | thinking 模型 `reasoning_content` | `400 reasoning_content` 错误 | `deepseek-chat` |
| ③ | `addHandoffBackMessages: true` | tool_call/ToolMessage 配对混乱 | `false` |
| ④ | `outputMode: "last_message"` | 子 Agent 看不到原始问题 | `"full_history"` |
