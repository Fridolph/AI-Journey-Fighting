# LangGraph 学习笔记（二）：从图到代码

> 衔接上篇：已理解图的七个核心概念（Node / Edge / Conditional Edge / Back Edge / END / State / Thread）
> 本篇目标：把图的概念映射到真实的 LangGraph 代码

## 一、AI 对话流程 → 图的映射

### 1.1 一个最简单的 AI 对话

```
用户说："你好"
AI 回复："你好！有什么可以帮你的？"
用户说："帮我写一首诗"
AI 回复："好的，这是一首关于..."
用户说："再短一点"
AI 回复："..."
```

### 1.2 翻译成图的语言

| 对话行为 | 图的概念 |
|---------|---------|
| 「用户说 → AI回复」反复执行 | **Back Edge 回边**（循环） |
| AI 回复前需要理解上下文 | **State**（存储完整对话历史） |
| 对话何时结束 | 外部调用者不再传入新消息，图停止 |

### 1.3 关键洞察：图不会自己走到 END

> AI 对话图会一直在循环里**等待用户输入**。它不是自己决定结束的，而是「外部调用者」决定不再传新消息，图才停。
>
> 这引出了一个新机制：**Human-in-the-loop（人在回路中）**。图跑到某个节点 → 暂停等待人类输入 → 继续跑。
>
> 前端类比：就像 `await` 一个 Promise，代码暂停在那里，等外部 `resolve(用户输入)` 后继续执行。

## 二、读懂 StateAnnotation（状态定义）

### 2.1 基本结构

```js
import { Annotation } from "@langchain/langgraph"

const StateAnnotation = Annotation.Root({
  query: Annotation({
    reducer: (_prev, next) => next,  // 更新规则
    default: () => "",               // 初始值
  }),
})
```

### 2.2 reducer 是什么？

`reducer` 定义：**「当这个字段被更新时，怎么合并新旧值？」**

```js
// 覆盖模式：不管旧值，直接用新值替换
reducer: (_prev, next) => next

// 追加模式：保留旧值，把新值追加进去
reducer: (prev, next) => [...prev, ...next]
```

### 2.3 两种模式的实际效果对比

```js
// 场景：AI 对话历史

// 覆盖模式 → 旧消息丢失
// 第1轮后：["用户：你好", "AI：你好！"]
// 第2轮后：["用户：写首诗", "AI：好的..."]  ← 第1轮没了！

// 追加模式 → 历史完整保留
// 第1轮后：["用户：你好", "AI：你好！"]
// 第2轮后：["用户：你好", "AI：你好！", "用户：写首诗", "AI：好的..."]
```

### 2.4 LangGraph 内置的 MessagesAnnotation

不需要手写消息列表的 reducer，LangGraph 已内置：

```js
import { MessagesAnnotation } from "@langchain/langgraph"

// 自己手写版（理解原理）
const StateAnnotation = Annotation.Root({
  messages: Annotation({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  })
})

// LangGraph 内置版（实际开发用）
const StateAnnotation = MessagesAnnotation
// 完全等价，且额外提供：
// 每条消息自动加 id（防重复）
// 支持「更新某条消息」（流式输出时用到）
```

## 三、代码示例精读

### 3.1 conditional-routing（条件分支）

```js
import { Annotation, END, START, StateGraph } from "@langchain/langgraph"

// 定义 State
const StateAnnotation = Annotation.Root({
  query:  Annotation({ reducer: (_prev, next) => next, default: () => "" }),
  route:  Annotation({ reducer: (_prev, next) => next, default: () => "chat" }),
  answer: Annotation({ reducer: (_prev, next) => next, default: () => "" }),
})

// 定义节点
const router = (state) => {
  const isMath = /[+\-*/]/.test(state.query)
  return { route: isMath ? "math" : "chat" }
}

const mathNode = (state) => {
  try { return { answer: String(eval(state.query)) } }
  catch { return { answer: "表达式无法计算" } }
}

const chatNode = (state) => ({
  answer: `你说的是：${state.query}`
})

// 组装图
const graph = new StateGraph(StateAnnotation)
  .addNode("router", router)
  .addNode("math",   mathNode)
  .addNode("chat",   chatNode)
  .addEdge(START, "router")
  .addConditionalEdges(
    "router",
    (state) => state.route,
    { math: "math", chat: "chat" }
  )
  .addEdge("math", END)
  .addEdge("chat", END)
  .compile()

// 运行
await graph.invoke({ query: "你好" })       // → chat 节点
await graph.invoke({ query: "10 * 8" })    // → math 节点
```

**代码 ↔ 图概念对照：**

| 代码 | 图概念 |
|------|-------|
| `.addNode("router", router)` | Node 节点（菱形判断） |
| `.addNode("math", mathNode)` | Node 节点（干活） |
| `.addEdge(START, "router")` | Edge 顺序边 |
| `.addConditionalEdges(...)` | Conditional Edge 条件边 |
| `.addEdge("math", END)` | END 出口 |
| `(state) => state.route` | 读取 state 决定走哪条路 |

**图结构：**

```
START
  ↓
[router]（写入 state.route）
  ↓
◇ state.route 是什么？
  ├── "math" → [math] → END ✅
  └── "chat" → [chat] → END ✅
```

### 3.2 loop-retry（循环重试）

```js
import { Annotation, END, START, StateGraph } from "@langchain/langgraph"

// 定义 State
const StateAnnotation = Annotation.Root({
  tries:   Annotation({ reducer: (_prev, next) => next, default: () => 0 }),
  ok:      Annotation({ reducer: (_prev, next) => next, default: () => false }),
  message: Annotation({ reducer: (_prev, next) => next, default: () => "" }),
})

// 定义节点
const attempt = (state) => {
  const tries = state.tries + 1
  const ok    = tries >= 3
  return { tries, ok, message: ok ? `第 ${tries} 次成功` : `第 ${tries} 次失败，继续重试` }
}

// 组装图
const graph = new StateGraph(StateAnnotation)
  .addNode("attempt", attempt)
  .addEdge(START, "attempt")
  .addConditionalEdges(
    "attempt",
    (state) => (state.ok ? "done" : "retry"),
    { retry: "attempt", done: END }  // retry → 回边！
  )
  .compile()

// 运行：第1次 → 失败重试 → 第2次 → 失败重试 → 第3次 → 成功 → END
await graph.invoke({ tries: 0 })
```

**图结构：**

```
START
  ↓
[attempt]（tries +1，判断 ok）
  ↓
◇ state.ok?
  ├── true  → "done" → END ✅
  └── false → "retry" → 回到 [attempt] ↩️
```

### 3.3 两个示例的本质区别

| 文件 | 图的形状 | 核心结构 |
|------|---------|---------|
| `conditional-routing` | 树形（有分叉，无回环） | 条件边 → 两个 END 出口 |
| `loop-retry` | 有环图（会循环） | 条件边 → 回边 or END |

## 四、Checkpointer（记忆层）

### 4.1 为什么需要 Checkpointer？

没有 Checkpointer 时，多轮对话需要手动维护历史：

```js
// 第1轮
const result1 = await graph.invoke({
  messages: [{ role: "user", content: "我叫小明" }]
})

// 第2轮：必须手动把上一轮结果带进去
const result2 = await graph.invoke({
  messages: [...result1.messages, { role: "user", content: "我叫什么？" }]
})
```

有了 Checkpointer，自动管理：

```js
const config = { configurable: { thread_id: "user_A" } }

// 第1轮
await graph.invoke({ messages: [{ role: "user", content: "我叫小明" }] }, config)

// 第2轮：只传新消息，历史自动读取
await graph.invoke({ messages: [{ role: "user", content: "我叫什么？" }] }, config)
// AI："你叫小明"
```

### 4.2 三种存储方式

| 你的类比 | LangGraph 实现 | 适用场景 |
|---------|--------------|---------|
| sessionStorage（内存，重启丢） | `MemorySaver` | 开发调试 |
| localStorage / 本地 DB | `SqliteSaver` | 本地持久化 |
| 云端数据库 | `PostgresSaver` | 生产环境 |

```js
import { MemorySaver } from "@langchain/langgraph"

// 开发调试（最常用入门）
const checkpointer = new MemorySaver()
```

### 4.3 整体架构

```
┌─────────────────────────────────────────┐
│              LangGraph 图                │
│   START → [llm 节点] → END              │
│               ↕                         │
│          state.messages                 │
└─────────────────────────────────────────┘
               ↕ 自动存取
┌─────────────────────────────────────────┐
│           Checkpointer（记忆层）          │
│   thread_id: "user_A" → state 快照       │
│   thread_id: "user_B" → state 快照       │
└─────────────────────────────────────────┘
               ↕ 存储介质
      MemorySaver / SqliteSaver / PostgresSaver
```

## 五、完整概念总览（两篇合并版）

### 图结构概念

| 概念 | 一句话 | 前端类比 |
|------|--------|---------|
| **Node 节点** | 干活的单元 | 一个函数 / 组件 |
| **Edge 顺序边** | 固定的下一步 | 顺序函数调用链 |
| **Conditional Edge 条件边** | 根据结果决定走哪 | `if/else` / 策略模式 |
| **Back Edge 回边** | 回到之前的节点 | `while` 循环 |
| **END 终止节点** | 图的出口，可以有多个 | `return` / 页面终态 |
| **State 状态** | 节点间传递的数据 | 组件的 `state` / store |
| **Thread 实例** | 图的一次独立执行 | 组件的一个实例 |

### LangGraph API 概念

| 概念 | 作用 | 备注 |
|------|------|------|
| `Annotation.Root` | 定义 state 的结构 | 每个字段需指定 reducer 和 default |
| `reducer` | 定义字段的更新规则 | 覆盖 or 追加 or 自定义 |
| `MessagesAnnotation` | 内置的对话消息 state | 自带追加 reducer，开发直接用 |
| `StateGraph` | 创建一张图 | 传入 StateAnnotation |
| `.addNode()` | 注册节点 | (名称, 函数) |
| `.addEdge()` | 添加顺序边 | (from, to) |
| `.addConditionalEdges()` | 添加条件边 | (from, 判断函数, 路牌映射) |
| `.compile()` | 编译图，锁定结构 | 可传入 `{ checkpointer }` |
| `.invoke()` | 运行图（同步等待结果） | 可传入 `config` 指定 thread_id |
| `MemorySaver` | 内存记忆（开发用） | 重启后丢失 |

## 六、下一步方向

- **方向 A：Tools（工具调用）**——让 AI 不只是「说话」，还能「干活」，如搜索网页、查数据库、调用 API
- **方向 B：Multi-Agent（多智能体）**——多个 AI 节点协作，一个负责搜索、一个负责总结、一个负责审核
- **方向 C：完整可运行 Demo**——把目前学的全部串起来，跑一个真实的对话 Agent
