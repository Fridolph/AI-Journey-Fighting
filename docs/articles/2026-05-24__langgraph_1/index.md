---
title: 「LangGraph 学习路径」上：从零到图 — 声明式编排的三原语
published: 2026-05-24
tags: [LangGraph, Agent, StateGraph, 条件路由, 回边]
category: AI
---

> 📌 **系列简介**：「LangGraph 学习路径」共三篇，从一个前端工程师的视角，系统拆解 LangGraph 从基础图到多智能体编排的核心概念。
> ⏱️ **预计阅读时间：15 分钟**
> 💻 **代码仓库**：[AI-Journey-Fighting/examples/langgraph-test](https://github.com/Fridolph/AI-Journey-Fighting/tree/main/examples/langgraph-test)
> 前端转 JS 全栈 + AI 学习笔记，欢迎批评指正 ~

---

# 从零到图：声明式编排的三原语

## 🗺️ 系列导航

| 篇 | 主题 | 核心能力 |
|----|------|---------|
| **上篇（本篇）** | State · Node · Edge + 条件路由 + 回边 | 从零搭图 |
| 中篇 | Checkpointer · interrupt · Human-in-the-loop | 记忆与暂停 |
| 下篇 | ToolNode · createReactAgent · Supervisor | Agent 与多智能体 |

---

## 📖 读这篇，你可以带走什么

| # | 你会学到 | 对应概念 |
|---|---------|---------|
| 1 | 图编排的三个原语：State、Node、Edge | basic-graph |
| 2 | 条件路由 = switch-case 的图表达 | conditional-routing |
| 3 | 回边 = 循环的声明式写法 | loop-retry |
| 4 | 前端概念怎么直接映射到 LangGraph | 全篇对照 |

---

## 写在前面

上个月开始系统学 LangGraph。在这之前，我对"Agent"的理解大概就是：调一个 LLM API，拿到回复，结束。

学了 LangGraph 之后才发现——**图和函数调用，是两个维度的东西。**

函数调用是"我告诉你下一步做什么"。图是"我告诉你有哪些节点，它们之间可以怎么走"。

这篇文章从最基础的三原语开始，用前端工程师的视角拆解：**State、Node、Edge 怎么变成代码？条件路由怎么表达？循环怎么声明？**

---

## 一、第一个图：State、Node、Edge

### 先跑起来

```js
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

const StateAnnotation = Annotation.Root({
  text: Annotation({
    reducer: (_prev, next) => next,  // 新值覆盖旧值
    default: () => "",
  }),
});

const step1 = (state) => ({ text: `${state.text} -> step1` });
const step2 = (state) => ({ text: `${state.text} -> step2` });

const graph = new StateGraph(StateAnnotation)
  .addNode("step1", step1)
  .addNode("step2", step2)
  .addEdge(START, "step1")
  .addEdge("step1", "step2")
  .addEdge("step2", END)
  .compile();

const result = await graph.invoke({ text: "hello" });
// { text: "hello -> step1 -> step2" }
```

15 行代码，跑通了三个概念。

### State = 共享黑板

```js
const StateAnnotation = Annotation.Root({
  text: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});
```

**把 State 想象成一块挂在墙上的黑板。** 多个工人（Node）依次走到黑板前，读黑板上的内容，写下自己的计算结果。下一个工人走过来继续操作——他看到的已经是上一个人写完的内容了。

| LangGraph | 前端 | 为什么像 |
|-----------|------|---------|
| `Annotation.Root()` | Redux Store Schema | 定义"共享数据长什么样" |
| `reducer` | Redux Reducer 的合并逻辑 | 新值和旧值怎么融合 |
| `(_prev, next) => next` | `setState(newValue)` | 新值直接覆盖旧值 |

**一个不需要手动 `{ ...state }` 的 Redux。**

关键区别：LangGraph 节点只返回**要改的字段**，框架自动做 `{ ...prevState, ...nodeReturn }`。你不用手写 `...state`，也不用担心改了不该改的字段。

### Node = 黑板前的操作工

```js
const step1 = (state) => ({ text: `${state.text} -> step1` });
```

- 接收：**完整**的全局 State
- 返回：**只返回你要改的字段**
- 不直接修改 state，而是返回"增量"

纯函数。没有副作用。给同一个 state，永远返回同一个结果——测试和调试都很友好。

### Edge = 谁之后是谁

```js
.addEdge(START, "step1")
.addEdge("step1", "step2")
.addEdge("step2", END)
```

链式 API，声明式编排。写完这段代码，就等于画好了这张图：

```
[START] → [step1] → [step2] → [END]
```

| API | 前端类比 |
|-----|---------|
| `addNode(name, fn)` | 注册一个 Redux Reducer |
| `addEdge(from, to)` | 组建 middleware 管道 |
| `compile()` | Webpack 打包完成 |
| `invoke(state)` | `dispatch(action) + await` |

`START` 和 `END` 是框架内置特殊节点。`compile()` 是"冻结"——之前你可以随意加节点改边线，compile 之后结构锁定为可执行态。

---

## 二、条件路由：从一条线到分叉路

第一个图是线性的——一条路走到黑。实际情况远不止于此：用户输入 `"你好"` 和 `"10 * 8"`，应该走完全不同的处理路径。

```js
// 路由器节点：只指路，不干活
const router = (state) => {
  const isMath = /[+\-*/]/.test(state.query);
  return { route: isMath ? "math" : "chat" };
};

// 条件边：根据 route 值决定下一站
.addConditionalEdges("router", (state) => state.route, {
  math: "math",
  chat: "chat",
})
```

**`addConditionalEdges` 三个参数逐个拆：**

| 参数 | 作用 | 前端类比 |
|------|------|---------|
| `"router"` | 从哪个节点出发 | `switch(value)` 的入口 |
| `(state) => state.route` | 取路由键的函数 | `switch` 的 `value` |
| `{ math, chat }` | 键 → 目标节点映射 | `case "math": ... case "chat": ...` |

同一个图，不同输入走不同的路径：

```
{ query: "你好" }    → router → chatNode → "你说的是：你好"
{ query: "10 * 8" }  → router → mathNode → "80"
```

**Mermaid 图里条件边会渲染为虚线（`-.->`），固定边为实线（`-->`）。** 这个免费的视觉提示让你一眼看出哪些路径"一定会走"，哪些"可能会走"。

### "路由器节点"是 LangGraph 的标志性模式

一个节点专门负责"指路"，自己不产出业务结果。后面学到的 supervisor、multi-agent 全部是这套思路的升级版——区别只在于路由器的判断逻辑从**正则**升级成 **LLM 决策**。

```
本文件：        router → 条件路由 → mathNode / chatNode
prebuilt-agent： agent → toolsCondition → ToolNode 或 END
multi-agent：    supervisor → LLM决策 → weatherAgent / triviaAgent
```

---

## 三、回边：循环的声明式表达

条件路由的路径指向**不同节点** → 分叉。
条件路由的路径指向**自身节点** → 循环。

```js
const attempt = (state) => {
  const tries = state.tries + 1;
  const ok = tries >= 3;
  return { tries, ok, message: ok ? "成功" : "失败，继续重试" };
};

.addConditionalEdges("attempt", (state) => (state.ok ? "done" : "retry"), {
  retry: "attempt",  // ← 指向自身 = 循环
  done: END,
})
```

等效的命令式代码——和图完全同构：

```js
let state = { tries: 0, ok: false };
while (!state.ok) {
  state.tries++;
  state.ok = state.tries >= 3;
}
```

**这里是理解 LangGraph 的关键转折点：** 你不需要写 `while`，不需要管理循环变量，不需要手动 `break`。你只需要声明"ok 就去 END，不 ok 就去 attempt"。引擎自动处理迭代次数、退出条件。

Mermaid 图里回边是一条弯曲的虚线从节点绕回自身——视觉上就是循环。

---

## 四、三篇对照

三个文件覆盖了编程控制流的全部三大结构：

| | basic-graph | conditional-routing | loop-retry |
|----|------------|-------------------|-----------|
| 形状 | `START→A→B→END` | `START→R→A或B→END` | `START→A→A→...→END` |
| 核心 API | `addEdge` | `addConditionalEdges` | 条件边指向自身 |
| 控制流 | 顺序结构 | 分支结构 | 循环结构 |
| 前端类比 | 函数链 `a()→b()` | `if/else` 路由 | `while` 循环 |

**任何程序都可以用这三种结构表达。** LangGraph 用三个文件覆盖了图编排的全部控制流原语——这是它作为通用编排引擎的底气。

---

## 五、前端工程师的对照表

| LangGraph 概念 | 前端类比 | 为什么像 |
|---------------|---------|---------|
| `Annotation.Root()` | Redux Store Schema | 定义共享数据结构 |
| Node（节点函数） | Redux Reducer | 接收 state，返回增量 |
| `addEdge(START, "A")` | 路由配置 | 声明"谁之后是谁" |
| `addConditionalEdges` | `switch-case` | 根据条件走不同分支 |
| 回边 | `while` 循环 | 节点指向自身构成循环 |
| `compile()` | Webpack 打包 | 冻结结构，准备执行 |
| `invoke(state)` | `dispatch(action) + await` | 点火并等待结果 |
| `drawMermaid()` | `console.log(组件树)` | 把图结构打印出来看 |

---

## 下一篇

上篇讲了"怎么搭图"——三条线覆盖了顺序、分支、循环。但这三个图每次 `invoke` 都是从零开始——没有记忆。

**中篇讲两个能力：Checkpointer（状态持久化）和 interrupt（人类断点）。** 让图从"一次性管道"变成"可暂停、可恢复、带记忆的状态机"——这才是 Agent 能长时间运行的底层基础。
