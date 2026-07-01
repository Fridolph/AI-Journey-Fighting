---
title: 「LangGraph 学习路径」下：Agent 与多智能体 — 从工具调用到调度员模式
published: 2026-05-30
tags: [LangGraph, Agent, ToolNode, createReactAgent, Supervisor, 多智能体]
category: AI
---

> 📌 **系列简介**：「LangGraph 学习路径」共三篇。上篇搭图、中篇加记忆和暂停，下篇引入 LLM 做决策——从单个 Agent 调用工具到多个 Agent 协同工作。
> ⏱️ **预计阅读时间：20 分钟**
> 💻 **代码仓库**：[AI-Journey-Fighting/examples/langgraph-test](https://github.com/Fridolph/AI-Journey-Fighting/tree/main/examples/langgraph-test)

---

# Agent 与多智能体：从工具调用到调度员模式

## 🗺️ 系列导航

| 篇 | 主题 | 核心能力 |
|----|------|---------|
| 上篇 | State · Node · Edge + 条件路由 + 回边 | 从零搭图 |
| 中篇 | Checkpointer · interrupt · Human-in-the-loop | 记忆与暂停 |
| **下篇（本篇）** | **ToolNode · createReactAgent · Supervisor** | **Agent 与多智能体** |

---

## 📖 读这篇，你可以带走什么

| # | 你会学到 | 对应概念 |
|---|---------|---------|
| 1 | Agent 的本质：LLM + 工具 + 图引擎的循环 | prebuilt-tool-node |
| 2 | 白盒 vs 黑盒两种 Agent 写法 | createReactAgent |
| 3 | 一条消息如何从"用户问题"变成"工具调用"再变成"回答" | 消息流追踪 |
| 4 | Supervisor 模式：一个调度员 + 多个专业子 Agent | multi-agent-supervisor |
| 5 | 接入 DeepSeek 的 4 个坑 | 踩坑合集 |

---

## 写在前面

上篇和中篇搭了图、加了记忆——但所有的判断逻辑都是硬编码的：正则、if/else、`amount > 0`。

这篇引入 LLM，让它来决定什么时候调工具、什么时候够了。再往上，多个 Agent 各自带自己的 tools，由一个 Supervisor 统一调度。这才是"Agent"这个词真正的含义。

---

## 一、Agent 的本质：LLM + 工具 + 图引擎

### 先跑起来

```js
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";

const getProductStock = tool(
  async ({ sku }) => getProductBySku(sku),     // ① 实际执行函数
  {
    name: "get_product_stock",                  // ② AI 用的名字
    description: "按 SKU 查商品名与库存",        // ③ AI 读这个决定要不要调
    schema: z.object({ sku: z.string() }),      // ④ 参数类型
  }
);
```

**Tool = 给 AI 的一个带说明书的函数。** AI 读 `description` 自己决定要不要调、传什么参数。你的核心工作是写好 description——在生成式 AI 时代，**注释比代码更重要**。

### 图结构：LLM ⇄ 工具循环

```
START
  ↓
[agent]（LLM 思考：要不要调工具？）
  ↓
◇ toolsCondition
  ├── 有 tool_calls → [tools]（执行工具）→ 回 [agent] 🔄
  └── 无 tool_calls → END ✅
```

### 完整消息流追踪

以"SKU-003 还剩多少库存？"为例：

```
① [HumanMessage("SKU-003 还剩多少库存？")]
         ↓ agent 节点（LLM 分析：我需要查库存）

② [HumanMessage, AIMessage(tool_calls: get_product_stock("SKU-003"))]
         ↓ toolsCondition → 有 tool_calls → 去 tools

③ [HumanMessage, AIMessage, ToolMessage("USB-C 线缆, 库存 120")]
         ↓ 回到 agent（LLM 拿到数据，组织回答）

④ [HumanMessage, AIMessage, ToolMessage, AIMessage("USB-C 线缆库存120件")]
         ↓ toolsCondition → 无 tool_calls → END ✅
```

**messages 是一个不断追加的数组。** 这和上篇 checkpointer 的 visitCount 累加是一个模式——只是 reducer 从 `(_prev, next) => next`（覆盖）换成了 `concat`（追加数组）。

---

## 二、两种写法：白盒 vs 黑盒

| | 白盒 `prebuilt-tool-node` | 黑盒 `prebuilt-agent` |
|---|---|---|
| API | `StateGraph` + `addNode` + `addEdge` | `createReactAgent` |
| 图结构 | 自己搭 | 框架内部建好 |
| 可控度 | 高（可插自定义节点） | 低（开箱即用） |

### 白盒：手动搭 ReAct 图

```js
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";

const toolNode = new ToolNode(tools);

const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", agentFn)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", toolsCondition, ["tools", END])
  .addEdge("tools", "agent")
  .compile();
```

**三个内置组件：**

| 组件 | 做什么 | 逻辑 |
|------|--------|------|
| `ToolNode` | 自动读取 tool_calls、执行工具、写回 ToolMessage | 95% 的场景通用 |
| `toolsCondition` | 判断"最后一条消息有没有 tool_calls？" | 有 → tools，无 → END |
| `createReactAgent` | 上面所有组装代码一封封装 | 一行搞定 |

**前两篇学到的概念，全部在这里出场：**

| 概念 | 在这里 |
|------|--------|
| `StateGraph` + `addNode` | 注册 agent/tools 节点 |
| `addEdge(START, "agent")` | 入口 |
| `addConditionalEdges` | toolsCondition 条件路由 |
| `"tools" → "agent"` 回边 | 工具执行完回到 LLM 再思考 |
| `compile()` + checkpointer | 可选传 checkpointer |

### 黑盒：一行创建

```js
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const agent = createReactAgent({
  llm: model,           // ★ 参数名 llm，不是 model
  tools: [getProductStock],
  systemPrompt: "你是仓库助手...",
  checkpointer: new MemorySaver(),
});

const result = await agent.invoke({
  messages: [new HumanMessage("SKU-002 还剩多少？")],
});
```

**`agent.invoke` 背后做了什么？** LLM 收到问题 → 判断需要调工具 → 返回 tool_call → ToolNode 执行 → 拿到真实数据 → LLM 再组织回答 → 结束。这和 `model.invoke` 的区别是质的：

| 方式 | 问"SKU-003 还剩多少？" | 结果 |
|------|----------------------|------|
| `model.invoke` | LLM 瞎猜或拒绝 | ❌ "我没有实时数据" |
| `agent.invoke` | LLM → 调工具 → 查真实数据 → 回复 | ✅ "USB-C 线缆，库存 120 件" |

---

## 三、Supervisor 模式：一个调度员 + 多个专业子 Agent

前两篇的所有图都是"一个脑子"。真实业务需要多个专业 Agent 协作——天气 Agent 查天气，小知识 Agent 查百科。

```
                    ┌── weather_agent（天气）
 用户 → supervisor ─┼── trivia_agent（小知识）
                    └── ...
```

### 子 Agent 定义

```js
const weatherAgent = createReactAgent({
  name: "weather_agent",     // ★ 必须，supervisor 用它识别
  llm: model,
  tools: [lookupWeatherTool],
  systemPrompt: "你只处理天气...",
});

const triviaAgent = createReactAgent({
  name: "trivia_agent",
  llm: model,
  tools: [lookupCityTriviaTool],
  systemPrompt: "你只讲城市小知识...",
});
```

### Supervisor 定义

```js
const workflow = createSupervisor({
  agents: [weatherAgent, triviaAgent],  // 直接传实例
  llm: model,
  prompt: `你是调度员，只负责选人。
- 问天气 → 用 weather_agent
- 问小知识 → 用 trivia_agent`,
  addHandoffBackMessages: false,
});
```

**Supervisor 也是一个 LLM。** 但它不做业务——它只通过 `tool_calls` 调用 handoff 工具（`transfer_to_weather_agent` / `transfer_to_trivia_agent`），把任务分给专业子 Agent。

### 执行过程

```
👤 用户：成都今天天气怎么样？

  🔧 supervisor 调用: transfer_to_weather_agent({})    ← 调度
  📦 工具返回: Successfully transferred               ← handoff 完成
  🔧 weather_agent 调用: lookup_weather("成都")        ← 子 Agent 开工
  📦 工具返回: {"summary":"多云","tempHighC":27,...}   ← 真实数据
  💬 weather_agent 回复: 成都今天多云，22~27°C，空气质量中高度污染...
```

### 用 stream() 做步骤化展示

```js
const stream = await app.stream(
  { messages: [new HumanMessage(QUERY)] },
  { streamMode: "values" }
);

let prevMsgCount = 0;
for await (const event of stream) {
  const msgs = event?.messages ?? [];
  for (let i = prevMsgCount; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.tool_calls?.length) console.log(`  🔧 调用: ${...}`);
    else if (m._getType?.() === "tool") console.log(`  📦 工具返回: ${...}`);
    else if (m._getType?.() === "ai") console.log(`  💬 回答: ${...}`);
  }
  prevMsgCount = msgs.length;
}
```

`streamMode: "messages"` 能做到更细粒度的打字机效果——每个 token 逐个吐。但 `values` 模式适合结构化展示，每一步的完整状态都在。

---

## 四、前端对照表（完整版）

| LangGraph | 前端 |
|-----------|------|
| `Annotation.Root()` | Redux Store Schema |
| Node | Redux Reducer |
| `addEdge` | 路由配置 |
| `addConditionalEdges` | `switch-case` |
| 回边 | `while` 循环 |
| `compile({ checkpointer })` | `configureStore({ middleware })` |
| `thread_id` | `sessionStorage` key |
| `interrupt()` | `async Generator` 的 `yield` |
| `Command({ resume })` | `generator.next(value)` |
| `createReactAgent` | 封装好的 SDK |
| agent ⇄ tools 循环 | LLM + Action + Reducer 的闭环 |
| `createSupervisor` | API Gateway / 微服务网关 |
| `streamMode: "values"` | WebSocket 推送完整状态 |

---

## 五、踩坑合辑

本次学习从 8 个文件中踩了不少坑，最有价值的几个：

### createAgent vs createReactAgent

`createAgent` 来自 `langchain`（旧 API），参数名是 `model`；`createReactAgent` 来自 `@langchain/langgraph/prebuilt`（新 API），参数名是 `llm`。传给 `createSupervisor` 时，旧版用 `.graph` 属性，新版直接传实例。

AI 框架半年迭代 API 可能大变样。保留原始文件 + 创建 fix 版是一个好策略。

### thinking 模型的 reasoning_content

DeepSeek 的 thinking 模型（如 `deepseek-v4-flash`）会额外返回 `reasoning_content` 字段。LangGraph 内部传递消息时不保留这个字段，DeepSeek API 后续调用要求原样传回 → 400 错误。

修复：通过 `modelKwargs: { thinking: { type: "disabled" } }` 关闭思考模式，或用 `deepseek-chat`（非 thinking 模型）。

### 不同 Agent 实例不能共享 LLM

Supervisor 和子 Agent 如果共享同一个 `ChatOpenAI` 实例，`bindTools` 会相互影响——Supervisor 的 handoff 工具泄漏到子 Agent 中，导致子 Agent 调用 `transfer_to_weather_agent` 而不是 `lookup_weather`。

### stream 事件格式随版本变化

LangGraph v1.3+ 的 `stream()` 事件格式从数组 `[mode, payload]` 变成了对象 `{ nodeName: output }`。踩这个坑时最快的方式是 `console.log(Object.keys(event))` 直接看。

---

## 六、三篇总结

| 篇 | 核心能力 | 从...到... |
|----|---------|-----------|
| 上 | State/Node/Edge + 条件路由 + 回边 | 从零到有图 |
| 中 | Checkpointer + interrupt + 转账实战 | 从无状态到有记忆 |
| 下 | ToolNode + createReactAgent + Supervisor | 从硬编码到 LLM 决策 |

**LangGraph 本质上就是一个声明式的图编排框架。** 你定义节点（Node）和连线（Edge），它负责按拓扑顺序调度执行。

从 `basic-graph.mjs`（一条线）到 `multi-agent-supervisor.mjs`（调度员 + 多个 Agent），8 个文件完成了一次从"调一个 LLM"到"编排多个 LLM + 工具 + 人工"的进阶。这个进阶不是 API 的堆叠，而是思维模型的三次跃迁：**函数调用 → 图编排 → Agent 团队。**

---

## 下一步

系列的下一步是 Multi-Agent 的进阶编排（串行/并行混合）和 SQLite 持久化。但在此之前，这 8 个文件已经覆盖了 LangGraph 的全部核心原语——掌握了这些，你就有了自己动手搭 Agent 的底气。

> 💡 所有示例代码在 [AI-Journey-Fighting/examples/langgraph-test](https://github.com/Fridolph/AI-Journey-Fighting/tree/main/examples/langgraph-test)，每个文件都有对应的 learning 注释版。
