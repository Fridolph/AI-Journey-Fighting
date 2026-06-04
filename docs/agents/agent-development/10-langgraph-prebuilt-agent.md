# LangGraph 学习笔记（四）：prebuilt Agent 深度拆解

> 衔接上篇：已掌握 interrupt 暂停机制
> 本篇目标：彻底搞懂 prebuilt Agent 的两层实现——白盒（手动搭）和黑盒（一行创建）

## 一、两个文件的关系

学习 prebuilt Agent 有两个关键文件，它们是同一件事的**两种写法**：

| | `prebuilt-tool-node`（白盒） | `prebuilt-agent`（黑盒） |
|---|---|---|
| **本质** | 手动组装图 | 一行创建 |
| **用的 API** | `StateGraph` + `addNode` + `addEdge` | `createReactAgent`（来自 `@langchain/langgraph/prebuilt`） |
| **图结构** | 你自己 `addNode` / `addEdge` | 框架内部帮你建好 |
| **可控程度** | **高**（可以插入自定义节点） | 低（开箱即用） |

> **结论：`prebuilt-agent` 是 `prebuilt-tool-node` 的封装版。** 学习时先看白盒，搞懂原理；再看黑盒，就知道它帮你省了什么。

## 二、白盒拆解：`prebuilt-tool-node` 手动搭图

### 2.1 图结构

```
START
  ↓
[agent]（LLM 思考：要不要调工具？）
  ↓
◇ toolsCondition（内置条件边）
  ├── 要调工具 → [tools]（执行工具）→ 回 [agent] ↩️
  └── 不需要   → END ✅
```

> 这是一个**循环图**！LLM 可以反复调工具，直到它觉得"够了"才结束。

### 2.2 三个核心组件

#### agent 节点 —— LLM 思考

```js
const llm = new ChatOpenAI({ ... }).bindTools(tools)  // ⚠️ 关键：bindTools 告诉 LLM「你有这些工具可用」

async function agent(state) {
  const response = await llm.invoke(state.messages)
  return { messages: response }
}
```

- 把当前所有 `messages` 喂给 LLM
- LLM 返回一条消息——可能是普通文本回复，也可能是 **tool_call 请求**（"请帮我调一下这个工具"）
- 写回 `state.messages`

#### tools 节点 —— `ToolNode` 执行工具

```js
import { ToolNode } from "@langchain/langgraph/prebuilt"

const toolNode = new ToolNode(tools)
```

- LangGraph 内置节点，**不需要自己写执行逻辑**
- 自动读取 `messages` 最后一条里的 `tool_calls`
- 执行对应工具函数，把结果作为 `ToolMessage` 写回 `messages`

#### 条件边 —— `toolsCondition` 判断

```js
import { toolsCondition } from "@langchain/langgraph/prebuilt"

.addConditionalEdges("agent", toolsCondition, ["tools", END])
```

- LangGraph 内置判断函数，**也不需要自己写**
- 逻辑就一句话：

```
最后一条消息有 tool_calls？
  ├── 有 → 去 tools
  └── 没有 → END
```

### 2.3 完整消息流追踪

以"SKU-001 还剩多少？"为例，观察 `state.messages` 如何变化：

```
① [HumanMessage("SKU-001 还剩多少？")]
         ↓ agent 节点（LLM 分析：我需要查库存）
② [HumanMessage, AIMessage(tool_calls: get_product_stock("SKU-001"))]
         ↓ toolsCondition → 有 tool_calls → 去 tools
③ [HumanMessage, AIMessage, ToolMessage("SKU-001: 可乐, 库存 88")]
         ↓ 回到 agent 节点（LLM 拿到数据，开始组织回答）
④ [HumanMessage, AIMessage, ToolMessage, AIMessage("SKU-001 可乐还剩 88 件")]
         ↓ toolsCondition → 没有 tool_calls → END ✅
```

> **messages 是一个不断追加的数组**，每一步都往里加新消息。LLM 每次 invoke 都能看到完整上下文——这就是 State 的 `reducer: concat` 在起作用。

### 2.4 完整组装代码

```js
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph"
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt"

const toolNode = new ToolNode(tools)

const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", agent)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", toolsCondition, ["tools", END])
  .addEdge("tools", "agent")
  .compile()
```

**白盒版完整可运行文件的结构一览：**

| 行 | 做什么 | 对应概念 |
|----|--------|---------|
| `.bindTools(tools)` | 告诉 LLM 有哪些工具可用 | LLM 的"武器清单" |
| `agent(state)` | LLM 思考 + 决定是否调工具 | Node 节点 |
| `new ToolNode(tools)` | 自动执行工具函数 | 内置节点 |
| `toolsCondition` | 判断最后一条消息有没有 tool_calls | 内置条件边 |
| `.addEdge("tools", "agent")` | 工具执行完回到 LLM | 回边（循环） |
| `MessagesAnnotation` | 消息列表自动追加 | State 定义 |

## 三、黑盒拆解：`createReactAgent` 一行搞定

`createReactAgent` 做的事就是——把白盒版的所有组装代码**一封封装**：

```js
import { createReactAgent } from "@langchain/langgraph/prebuilt"

// createReactAgent 内部帮你做了：
//   new StateGraph(MessagesAnnotation)
//     .addNode("agent", agent)
//     .addNode("tools", new ToolNode(tools))
//     .addEdge(START, "agent")
//     .addConditionalEdges("agent", toolsCondition, ["tools", END])
//     .addEdge("tools", "agent")
//     .compile({ checkpointer })
```

所以你只需要传配置：

```js
const agent = createReactAgent({
  llm: model,                          // ⚠️ 参数名是 llm，不是 model
  tools: [getProductStock],
  checkpointer: new MemorySaver(),
  // systemPrompt 在 createReactAgent 中通过 stateModifier 实现
})
```

### 常见 bug 与修正

| 错误写法 | 问题 | 正确写法 |
|---------|------|---------|
| `import { createAgent, tool } from "langchain"` | `createAgent` 不在 langchain 包里 | `import { createReactAgent } from "@langchain/langgraph/prebuilt"` |
| `import { tool } from "langchain"` | `tool` 也不在 langchain 包里 | `import { tool } from "@langchain/core/tools"` |
| `createAgent({ model })` | 参数名错误 | `createReactAgent({ llm: model })` |
| `agent.graph.getGraphAsync()` | agent 本身就支持 getGraphAsync | `agent.getGraphAsync()` |

## 四、Tool 定义三要素

```js
import { tool } from "@langchain/core/tools"
import { z } from "zod"

const getProductStock = tool(
  async ({ sku }) => getProductBySku(sku),  // ① 实际执行的函数
  {
    name: "get_product_stock",               // ② AI 调用时的名字
    description: "按 SKU 查商品名与库存，SKU 如 SKU-001",  // ③ AI 靠这个决定要不要调
    schema: z.object({ sku: z.string().describe("商品 SKU") }),  // ④ 参数类型
  }
)
```

**Tool 本质：「给 AI 的一个带说明书的函数」**

> AI 读取 `description`，自己决定：要不要调用？传什么参数？开发者只需要写好 description，AI 自动判断。

## 五、白盒 vs 黑盒 选择指南

| 场景 | 推荐方式 |
|------|---------|
| 标准 AI 问答 + 工具调用 | `createReactAgent`（黑盒） |
| 需要自定义分支逻辑 | 手写 `StateGraph`（白盒） |
| 需要 interrupt 人工确认 | 手写 `StateGraph` + `interrupt` |
| 需要自定义节点插入 agent ↔ tools 循环 | 手写 `StateGraph` + `ToolNode` + `toolsCondition` |
| 多个 AI 节点协作 | 手写 `StateGraph`（Multi-Agent） |

## 六、LangGraph 学习全景

| 篇目 | 主题 | 核心能力 |
|------|------|---------|
| 01 热身 | 图的概念推导 | Node / Edge / Conditional Edge / Back Edge / State / Thread |
| 02 从图到代码 | API 映射 + Checkpointer | StateAnnotation / reducer / MessagesAnnotation / MemorySaver |
| 03 interrupt | 暂停机制 | interrupt() / Command({ resume }) / 多 interrupt 流程 |
| 04 prebuilt Agent | 白盒拆解 + 黑盒封装 | `ToolNode` / `toolsCondition` / `createReactAgent` / 消息流追踪 |
