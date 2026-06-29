# 07 — Prebuilt Agent 白盒与黑盒

> 学习日期：2026-05-21
> 白盒文件：`examples/langgraph-test/src/prebuilt-tool-node.mjs`（手动搭图）
> 黑盒文件：`examples/langgraph-test/src/prebuilt-agent-fix.mjs`（一行创建）
> 原始文件：`examples/langgraph-test/src/prebuilt-agent.mjs`（旧 API，已建修复版）

---

## 一、学习目标

- 理解 Prebuilt Agent 的两层实现：**白盒（手动搭图）vs 黑盒（一行创建）**
- 掌握 `ToolNode` + `toolsCondition` + `createReactAgent` 三个内置组件
- 搞清楚"LLM 思考 → 调工具 → 再思考 → 结束"这个核心循环
- 体会**前 6 篇学到的所有概念汇集于这一张图**

---

## 二、一个文件的关系

两个文件是同一件事的**两种写法**：

| | `prebuilt-tool-node`（白盒） | `prebuilt-agent`（黑盒） |
|---|---|---|
| **本质** | 手动组装图 | 一行创建 |
| **API** | `StateGraph` + `addNode` + `addEdge` | `createReactAgent` |
| **图结构** | 自己搭 | 框架内部建好 |
| **可控度** | 高（可插自定义节点） | 低（开箱即用） |

**结论：黑盒是白盒的封装。** 先看白盒搞懂原理，再看黑盒就知道它帮你省了什么。

---

## 三、白盒拆解：手动搭图

### 3.1 图结构

```
START
  ↓
[agent]（LLM 思考：要不要调工具？）
  ↓
◇ toolsCondition（内置条件边）
  ├── 有 tool_calls → [tools]（执行工具）→ 回 [agent] 🔄
  └── 无 tool_calls → END ✅
```

这是**循环图**——LLM 可以反复调工具，直到它觉得"够了"才结束。

### 3.2 三个内置组件

#### agent 节点 — LLM 思考

```js
const llm = new ChatOpenAI({...}).bindTools(tools)
//                              ↑ 关键！告诉 LLM「你有这些工具」

async function agent(state) {
  const response = await llm.invoke(state.messages)
  return { messages: response }
}
```

把当前所有 `messages` 喂给 LLM。LLM 返回一条消息——可能是普通文本回复，也可能是 **tool_call 请求**（"请帮我调一下这个工具"）。

#### ToolNode — 自动执行工具

```js
import { ToolNode } from "@langchain/langgraph/prebuilt"
const toolNode = new ToolNode(tools)
```

LangGraph 内置节点，**不需要自己写执行逻辑**。它会：
1. 读取 `messages` 最后一条里的 `tool_calls`
2. 执行对应工具函数
3. 把结果作为 `ToolMessage` 写回 `messages`

#### toolsCondition — 判断条件边

```js
import { toolsCondition } from "@langchain/langgraph/prebuilt"

.addConditionalEdges("agent", toolsCondition, ["tools", END])
```

LangGraph 内置判断函数，逻辑就一句话：

```
最后一条消息有 tool_calls？
  ├── 有 → 去 tools 执行
  └── 无 → END，把 LLM 回复返回给用户
```

### 3.3 完整消息流追踪

以"SKU-003 还剩多少库存？"为例：

```
① [HumanMessage("SKU-003 还剩多少库存？")]
         ↓ agent 节点（LLM 分析：我需要查库存）

② [HumanMessage, AIMessage(tool_calls: get_product_stock("SKU-003"))]
         ↓ toolsCondition → 有 tool_calls → 去 tools 节点

③ [HumanMessage, AIMessage, ToolMessage("USB-C 线缆, 库存 120")]
         ↓ 回到 agent 节点（LLM 拿到数据，组织回答）

④ [HumanMessage, AIMessage, ToolMessage, AIMessage("USB-C 线缆库存120件")]
         ↓ toolsCondition → 没有 tool_calls → END ✅
```

> messages 是一个不断追加的数组。这和 `checkpointer-memory` 的 visitCount 累加是一个模式——只是 reducer 从 `(_prev, next) => next` 换成了 `concat`（追加数组）。

### 3.4 完整组装代码

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

### 3.5 前 6 篇的概念全部出场

| 概念 | 首次出现 | 在这里 |
|------|---------|--------|
| `StateGraph` + `addNode` | basic-graph | 注册 agent/tools 节点 |
| `addEdge(START, "agent")` | basic-graph | 入口 |
| `addConditionalEdges` | conditional-routing | toolsCondition 条件路由 |
| `"tools" → "agent"` 回边 | loop-retry | 工具执行完回到 LLM 再思考 |
| `compile()` + checkpointer | checkpointer-memory | 可选传 checkpointer |
| `interrupt` | graph-interrupt | 需要时可以插入（手动搭图场景） |

**没有新概念——全部是前 6 篇学过的东西拼在一起。**

---

## 四、黑盒拆解：一行创建

### 4.1 createReactAgent 做了什么

```js
import { createReactAgent } from "@langchain/langgraph/prebuilt"

const agent = createReactAgent({
  llm: model,
  tools: [getProductStock],
  systemPrompt: "你是仓库助手...",
  checkpointer: new MemorySaver(),
})
```

它在内部帮我们搭好了白盒的整个图：

```js
// createReactAgent 内部等价于：
new StateGraph(MessagesAnnotation)
  .addNode("agent", agentFn)              // 自动创建
  .addNode("tools", new ToolNode(tools))  // 自动创建
  .addEdge(START, "agent")
  .addConditionalEdges("agent", toolsCondition, ["tools", END])
  .addEdge("tools", "agent")
  .compile({ checkpointer })
```

### 4.2 白盒 vs 黑盒对照

| 工作 | 白盒 | 黑盒 |
|-----|------|------|
| 定义 agent 节点 | ✅ 自己写 | ❌ 框架生成 |
| 注册 ToolNode | ✅ 自己 `new ToolNode(tools)` | ❌ 框架创建 |
| 搭图 | ✅ addNode → addEdge → compile | ❌ 内部组装 |
| 条件边 | ✅ 自己写 `addConditionalEdges` | ❌ 内部用 toolsCondition |
| 传 LLM + tools | ✅ 自己调 `.bindTools()` | ✅ 传 `llm` 和 `tools` |
| 传 systemPrompt | ✅ 自己写在消息列表 | ✅ 传 `systemPrompt` 参数 |

---

## 五、Tool 定义三要素

```js
const getProductStock = tool(
  async ({ sku }) => getProductBySku(sku),  // ① 实际执行的函数
  {
    name: "get_product_stock",               // ② AI 调用时的名字
    description: "按 SKU 查商品名与库存",     // ③ AI 靠这个决定要不要调
    schema: z.object({ sku: z.string() }),   // ④ 参数类型
  }
)
```

**Tool = 给 AI 的一个带说明书的函数。** AI 读 `description` 自己决定要不要调、传什么参数。开发者的核心工作是写好 `description`——生成式 AI 时代，注释比代码更重要。

---

## 六、关键机制：bindTools + toolsCondition

```
.bindTools(tools)         → 告诉 LLM「你有这些武器可用」
                            （在 LLM 的 system prompt 里注入工具定义）

toolsCondition(state)     → 检查 LLM 返回的消息「它开枪了吗？」
  ├── 有 tool_calls      → 去 tools 节点执行
  └── 无 tool_calls      → END，把 LLM 的回复给用户
```

这两个东西组合起来就是 LangGraph Agent 最核心的循环：

```
LLM 思考 → 需要工具？ → 调工具 → 拿到结果再思考 → 够了？ → 结束
```

---

## 七、运行验证

```bash
# 白盒版
cd examples/langgraph-test
node src/prebuilt-tool-node.mjs

# 黑盒版（修复版）
node src/prebuilt-agent-fix.mjs
```

**预期输出：** Mermaid 图（agent ⇄ tools 循环）+ 查询结果。

---

## 八、核心洞察

### 🔑 这个循环图是"三步走"的直观体现

前 6 篇三步走分离在不同的文件里：

```
basic-graph:            线性 → 顺序执行
conditional-routing:    分叉 → 条件路由
loop-retry:             回边 → 循环
```

到了 Prebuilt Agent，**三者组合在一起**：

| 图的要素 | 在这里 |
|---------|--------|
| `START → agent` | 线性（必走） |
| `agent → toolsCondition → tools/END` | 条件路由（分叉） |
| `tools → agent` | 回边（工具执行完回到 LLM 再思考） |

```
START → agent → toolsCondition ────有 tool_calls──→ tools
                         │                              │
                         │                              ↓
                         │                         回边 to agent 🔄
                         │
                         └───无 tool_calls──→ END ✅
```

### 🔑 内置组件 vs　手写的边界

| 组价 | 为什么内置 | 什么时候需要手写 |
|------|----------|----------------|
| `ToolNode` | 95% 的工具执行逻辑都一样——读 tool_calls → 调函数 → 写 ToolMessage | 需要在工具执行前后做额外处理（如记日志、限流） |
| `toolsCondition` | 判断条件永远是"最后一条消息有没有 tool_calls" | 需要更复杂的路由逻辑（如根据 tool 名走不同后置处理） |
| `createReactAgent` | 标准 LLM + ToolNode 循环 | 需要自定义图结构（如多个 agent 协作、插入 interrupt） |

### 🔑 黑盒的取舍

黑盒不是"比白盒少做"——它内部做的事和白盒一样多。区别是：**谁来决定**。

| 场景 | 推荐 |
|------|------|
| 标准 AI 问答 + 工具调用 | `createReactAgent`（黑盒） |
| 需要 interrupt 人工确认 | 手写白盒 + `interrupt` |
| 多个 AI 协作 | `StateGraph`（Multi-Agent） |

---

## 九、踩坑记录：旧 API 迁移

`prebuilt-agent.mjs` 用的是旧 API：

```js
// ❌ 已废弃
import { createAgent, tool } from "langchain";
const agent = createAgent({ model, tools });
agent.graph.getGraphAsync();
```

三个问题：

| 问题 | 原因 | 修复 |
|------|------|------|
| `createAgent` | langchain v1.x 早期 API，已迁移到 `@langchain/langgraph/prebuilt` | `createReactAgent` |
| `tool` | 从 langchain 导入已不推荐 | 改为 `@langchain/core/tools` |
| `agent.graph.getGraphAsync()` | createReactAgent 的实例本身支持 getGraphAsync | `agent.getGraphAsync()` |

这暴露了 AI 框架的一个现实：**半年迭代，API 可能已经大变样。** 这也是 AGENTS.md 规范要求保留原始文件 + 创建 fix 版的原因。

---

## 十、学习注释版

| 文件 | 说明 |
|------|------|
| `src/prebuilt-tool-node.mjs` | 白盒版（原始文件，不变） |
| `src/prebuilt-agent.mjs` | 黑盒版原始旧 API 文件 |
| `src/prebuilt-agent-fix.mjs` | 黑盒版修复文件（createReactAgent） |

---

## 十一、前 7 篇学习全景

| # | 文件 | 概念 | 图拓扑贡献 |
|---|------|------|-----------|
| 01 | basic-graph | State / Node / Edge | 线性边 |
| 02 | conditional-routing | 条件路由 | 分叉边 |
| 03 | loop-retry | 回边 | 循环边 |
| 04 | checkpointer-memory | 状态持久化 | thread_id + 存档 |
| 05 | graph-interrupt | 中断恢复 | interrupt + Command |
| 06 | graph-interrupt-pro | 组合实战 | 5 节点 + 3 路分支 + 回边 |
| **07** | **prebuilt-agent** | **ToolNode + createReactAgent** | **LLM ⇄ 工具循环** |
