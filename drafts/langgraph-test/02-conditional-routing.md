# 02 — conditional-routing.mjs：条件路由入门

> 学习日期：2026-05-21
> 原始文件：`examples/langgraph-test/src/conditional-routing.mjs`

---

## 一、学习目标

- 从"一条线"升级到"分叉路"——掌握 `addConditionalEdges` 条件路由
- 理解"路由器节点"这个 LangGraph 标志性模式的运作方式
- 感受**图比函数链强在哪**：同一个节点可以指向不同的后继

---

## 二、与 basic-graph 的 diff 对照

把两个文件从头并排看，差异一目了然：

| 维度 | basic-graph | conditional-routing |
|------|-------------|---------------------|
| State 字段 | 1 个 `text` | 3 个 `query` / `route` / `answer` |
| 节点数 | 2 个纯处理节点 | 3 个（1 个裁判 + 2 个处理） |
| 连线方式 | `addEdge` 固定路径 | `addConditionalEdges` 条件路径 |
| 执行路径 | 始终 step1 → step2 | 含运算符走 math，否则走 chat |
| Mermaid 边样式 | 实线 `-->` | 条件边用虚线 `-.->` |
| 形状 | 直线 | 分叉 |

```
basic-graph:             conditional-routing:

[START]                     [START]
   │                            │
   ▼                            ▼
 step1                       router
   │                          ╱    ╲
   ▼                        ╱       ╲
 step2                    math     chat
   │                      (虚线)    (虚线)
   ▼                       │        │
 [END]                     ▼        ▼
                          [END]  [END]
```

---

## 三、逐层拆解

### 3.1 State 拆成三个字段 — "各司其职"

```js
const StateAnnotation = Annotation.Root({
  query:  Annotation({ default: () => "" }),    // 输入
  route:  Annotation({ default: () => "chat" }), // 路由标记
  answer: Annotation({ default: () => "" }),     // 输出
});
```

basic-graph 只有一个 `text`，所有节点都在上面"追加"——像一条传送带上所有的人都在一个包裹上写字。现在拆成三个，各节点只读写自己关心的部分：

| 字段 | 谁写入 | 谁读取 | 前端类比 |
|------|--------|--------|---------|
| `query` | invoke 时传入 | router、mathNode、chatNode | HTTP Request Body |
| `route` | router 节点 | addConditionalEdges | 路由 path / case 值 |
| `answer` | mathNode / chatNode | invoke 调用方 | HTTP Response Body |

> **关键理解：State 是消息总线，不是数据库。** 各个节点通过 State 解耦——router 不知道后面有 math 还是 chat，它只关心 route 字段。处理节点不知道前面有 router，它们只读 query。

### 3.2 router 节点 — "不干活的裁判"

```js
const router = (state) => {
  const isMath = /[+\-*/]/.test(state.query);
  return { route: isMath ? "math" : "chat" };
};
```

**做什么：** 读 `state.query`，写 `state.route`。  
**不做什么：** 不产生任何业务输出（不写 `answer`）。  
**类比：** React Router 的 `<Navigate to={...}>`、Vue 的导航守卫 `next('/path')`、"路口交警"。

这个模式在 LangGraph 中极其常见——**一个节点专门负责"指路"，自己不干活**。后序的 supervisor agent 复用了同样的思路，只是 router 的判断逻辑从正则换成了 LLM 调用。

### 3.3 addConditionalEdges — 本节主角

```js
.addConditionalEdges("router", (state) => state.route, {
  math: "math",
  chat: "chat",
})
```

拆开看三个参数：

| 参数 | 类型 | 作用 | 类比 |
|------|------|------|------|
| `"router"` | 字符串 | 从哪个节点出发（起点） | `switch(value)` 的入口 |
| `(state) => state.route` | 函数 | 从 state 取路由键 | `switch(value)` 的 value |
| `{ math, chat }` | 对象 | 键 → 目标节点映射 | `case "math": ... case "chat": ...` |

等效的命令式代码：

```js
// addConditionalEdges 等价于：
const routeKey = state.route;              // ← 第二步：取路由键
const target = {                           // ← 第三步：查路由表
  math: "mathNode",
  chat: "chatNode",
}[routeKey];
execute(target, state);                    // ← 执行目标节点
```

**Mermaid 中的表现：** 条件边渲染为 **虚线**（`router -.-> math` / `router -.-> chat`），而固定边是实线（`math --> END`）。这个视觉区别非常重要——一眼就能看出哪些路径是"确定性的"，哪些是"条件性的"。

### 3.4 两个处理节点 — 各自独立

```js
// math 分支：计算表达式
const mathNode = (state) => {
  try { return { answer: String(eval(state.query)) }; }
  catch { return { answer: "表达式无法计算" }; }
};

// chat 分支：echo 用户输入
const chatNode = (state) => ({ answer: `你说的是：${state.query}` });
```

两个节点**完全独立**——互不知道对方存在，各自处理自己的分支。它们都只读 `state.query`、只写 `state.answer`。

前端类比：这是两个独立页面组件，由路由决定渲染哪一个。`/math` 路由渲染 CalculatorPage，`/chat` 路由渲染 ChatPage——它们不会互相引用。

---

## 四、执行流程

```
invoke({ query: "你好" })
  → START: state = { query: "你好", route: "chat", answer: "" }
  → router: isMath = false → 返回 { route: "chat" }
  → addConditionalEdges: state.route = "chat"
  → 查路由表: chat → "chatNode"
  → chatNode: 返回 { answer: "你说的是：你好" }
  → END: 结果 { query: "你好", route: "chat", answer: "你说的是：你好" }

invoke({ query: "10 * 8" })
  → START: state = { query: "10 * 8", route: "chat", answer: "" }
  → router: isMath = true → 返回 { route: "math" }
  → addConditionalEdges: state.route = "math"
  → 查路由表: math → "mathNode"
  → mathNode: eval("10 * 8") → 返回 { answer: "80" }
  → END: 结果 { query: "10 * 8", route: "math", answer: "80" }
```

---

## 五、Mermaid 图解读

```
graph TD;
  __start__([__start__])
  router(router)
  math(math)
  chat(chat)
  __end__([__end__])
  __start__ --> router;        // 实线：一定走
  chat --> __end__;            // 实线：一定走
  math --> __end__;            // 实线：一定走
  router -.-> math;            // 虚线：条件走
  router -.-> chat;            // 虚线：条件走
```

**虚线 vs 实线** 是 LangGraph 给你的免费视觉提示——虚线路径不会每次都执行，实线路径一定会执行。

---

## 六、运行验证

```bash
cd examples/langgraph-test
node src/conditional-routing.mjs
```

**预期输出：**

```
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
  __start__([__start__]):::first
  router(router)
  math(math)
  chat(chat)
  __end__([__end__]):::last
  __start__ --> router;
  chat --> __end__;
  math --> __end__;
  router -.-> math;
  router -.-> chat;

result: { query: '你好', route: 'chat', answer: '你说的是：你好' }
result: { query: '10 * 8', route: 'math', answer: '80' }
```

注意两个 result 中的 `route` 字段——一个 `"chat"` 一个 `"math"`，证明走了不同的分支。

---

## 七、核心洞察

### 🔑 "路由器节点"是 LangGraph 的标志性模式

一个节点负责"指路"，自己不做业务——这个模式在后面会反复出现：

```
本文件：        router → 条件路由 → mathNode / chatNode
loop-retry：   attempt → 条件路由 → attempt（自环）或 END
prebuilt-agent： agent → toolsCondition → ToolNode 或 END
multi-agent：   supervisor → LLM 决策 → weatherAgent / triviaAgent
```

本质上都是**同一个模式**：一个"决策节点" + `addConditionalEdges` 动态路由。

### 🔑 虚线边 = "可能走也可能不走"

Mermaid 里条件边渲染为虚线，固定边为实线。这个免费的视觉提示让你一眼看出图的拓扑复杂度——虚线越多，图的分支逻辑越复杂。

### 🔑 图的威力：同一张图，不同路径

这个例子的核心展示是：**相同的图，不同的输入→走不同的路径→得到不同的结果。** 命令式代码写成：

```js
if (isMath) { return eval(query); }
else { return `你说的是：${query}`; }
```

也等价，但如果这个分支逻辑在图里可以扩展到：3 条分支、5 条分支、或者 LLM 动态决策路由——这就是图比 `if/else` 强的地方。

### 🔑 后续的升级：将正则替换为 LLM

当前 router 的逻辑是**确定性**的——正则表达式判断。而在 `multi-agent-supervisor` 里，router 会升级为 LLM：

```js
// 未来的 router：用 LLM 判断走哪个分支
const llmRouter = async (state) => {
  const decision = await llm.invoke(`...${state.query}...`);
  return { route: decision.agentName };
};
```

将"正则判断"替换为"LLM 判断"，静态路由就变成了**动态路由**。

---

## 八、学习注释版

```
examples/langgraph-test/src/conditional-routing-learning.mjs
```

原始文件保持不变，学习版添加了：
- 各段代码的目的说明
- 与 basic-graph 的对比标注
- Mermaid 虚线实线的解释
- "分拣传送带"的思维模型

---

## 九、下一步预告

`loop-retry.mjs` — 当 mathNode 计算失败时，不直接返回错误，而是**回到 router 重新路由**。引入 LangGraph 的第三个核心能力：**回边（Back Edge）= 循环**。

这会让图从"分叉"升级到"可以回到曾经走过的节点"——在状态机、重试、多轮对话等场景中非常有用。

---

## 附：reducer 快速验证

三个字段都用了 `(_prev, next) => next`，如果你在节点里同时返回 `route` 和 `answer` 会怎样？

```js
// 假设一个节点返回两个字段：
const weirdNode = (state) => ({
  route: "math",
  answer: "42"
});
// 框架自动 merge：{ ...prevState, route: "math", answer: "42" }
// 两个字段独立合并，互不干扰
```

多个字段各自使用自己的 reducer，互不干扰——这是 Annotation API 的天然优势。
