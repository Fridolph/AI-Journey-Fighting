# 从一条线到调度员——一个前端工程师的 LangGraph 学习路径

> 草稿，待 review 后整理进入 `docs/articles/`

---

## 一、写在前面：为什么要学 LangGraph？

如果你是一个前端工程师，正在往全栈 + AI 方向走，大概会遇到这个问题：

你调了 OpenAI / DeepSeek 的 API，拿到了回复。但这只是**一问一答**。现实业务需要的是：

- 查了库存再回答用户（工具调用）
- 聊了 5 轮还能记得上下文（会话持久化）
- 用户输入错了要重问，3 次还没输入就跳过（Human-in-the-loop）
- 把"天气"问题分给天气机器人，"知识"问题分给百科机器人（多 Agent 调度）

LangGraph 解决的就是这个：**从"一次性问 LLM"到"有状态、多步骤、可中断、可编排"的升级。**

这篇笔记不会教你 LangGraph 的全部 API，而是给你一个前端工程师能直接套用的**思维模型**。

---

## 二、学习路径全景

从最简单的图到复杂的多 Agent 调度，一共 8 步：

```
线 → 树 → 环 → 记忆 → 暂停 → 组合 → 预构建 → 调度员
│     │     │     │      │      │      │        │
01    02    03    04     05     06     07       08
basic cond  loop  check  inter  pro    prebuilt supervisor
graph route retry point rupt   combo  agent
```

| # | 概念 | 前端类比 | 核心代码行 |
|---|------|---------|-----------|
| 01 | State / Node / Edge | Redux Reducer + 组件树 | `.addNode().addEdge().compile()` |
| 02 | 条件路由 `addConditionalEdges` | `if/else` / `switch` | `addConditionalEdges("router", fn, {math, chat})` |
| 03 | 回边（自环） | `while` 循环 | `{ invalid: "askAmount" }` → 指向自身 |
| 04 | Checkpointer + thread_id | `localStorage` + session | `compile({ checkpointer })` |
| 05 | interrupt + Command | `yield` / Generator | `const x = interrupt({...})` / `Command({ resume: x })` |
| 06 | 组合实战 | 完整表单流程 | 5 节点 + 3 路分支 + 2 处 interrupt |
| 07 | ToolNode + createReactAgent | SDK 封装 | `.bindTools()` + `toolsCondition` |
| 08 | Supervisor 调度 | 微服务网关 | `createSupervisor({ agents, llm, prompt })` |

---

## 三、四个关键思维模型

### 3.1 State = 共享黑板（basic-graph）

```js
const StateAnnotation = Annotation.Root({
  text: Annotation({
    reducer: (_prev, next) => next,  // 新值覆盖旧值
    default: () => "",
  }),
});
```

**理解方式：** 想象一块挂在墙上的黑板。多个工人（Node）依次走到黑板前，读黑板上的内容，写下自己的计算结果，然后下一个工人走过来继续操作。

最像前端的什么？**Redux reducer**。区别是你不需要手动 `{ ...state, text: newText }`，框架帮你做 merge。

**关键洞察：** State 是"流经"每个节点的，不是"存在某个地方"的。

### 3.2 回边 = 循环（loop-retry）

```js
.addConditionalEdges("attempt", (state) => (state.ok ? "done" : "retry"), {
  retry: "attempt",  // ← 指向自身 = 循环
  done: END,
})
```

**理解方式：** 条件路由的路径指向了节点自身。等效于 `while (!ok) { attempt(); }`。

**关键洞察：** 所有编程控制流（顺序 / 分支 / 循环）都可以用图表达。LangGraph 用 3 个文件就覆盖完了。

### 3.3 interrupt = 人类断点（graph-interrupt-pro）

```js
// 节点内部
const input = interrupt({
  hint: "请输入转账金额",
  currentBalance: state.balance,
});
// input 的值由外部通过 Command 注入

// 外部调度
const paused = await graph.invoke({}, config);
// 用户输入...  
const done = await graph.invoke(new Command({ resume: "200" }), config);
```

**理解方式：** 这就是 `async Generator` 的 `yield`——图走到这里停下来，抛信息给你看，等你回复再继续。

最像前端的什么？**`window.prompt()`**，不过是异步、非阻塞的——图在等待期间可以存档、恢复、甚至 3 次不输入就自动跳过。

### 3.4 Supervisor = 老板分任务（multi-agent-supervisor）

```js
const workflow = createSupervisor({
  agents: [weatherAgent, triviaAgent],
  llm: model,
  prompt: `你是调度员...
- 问天气 → 用 weather_agent
- 问小知识 → 用 trivia_agent`,
});
```

**理解方式：** Supervisor 本身也是一个 LLM，但它不做业务，只负责"谁的问题分给谁"。每个子 Agent 是独立的 ReAct Agent，有自己的 LLM + tools + system prompt。

最像前端的什么？**微服务网关**或 API Gateway——请求进来，网关根据路径分给不同的后端服务。

---

## 四、三个踩坑实录

### 4.1 空 Command → EmptyInputError

**现象：** 在 `> ` 提示处直接回车 → 界面崩溃。
**根因：** `Command({ resume: "" })` → LangGraph 检查 `writes` 为空 → 抛错。
**修复：** 空输入时传非法占位符 `"__EMPTY__"`，让业务校验捕获后走回边重问。

**教训：** `Command.resume` 的值永远不能为空字符串。三层校验各管各的——框架管格式、节点管业务、调度层管交互。

### 4.2 createAgent vs createReactAgent

**现象：** `multi-agent-supervisor.mjs` 运行报 400 错误。
**根因：** 文件用 `createAgent from "langchain"`（旧 API），而 `createSupervisor` 需要 `createReactAgent from "@langchain/langgraph/prebuilt"`（新 API）。

| 对比 | createAgent（旧） | createReactAgent（新） |
|------|-----------------|----------------------|
| 包 | `langchain` | `@langchain/langgraph/prebuilt` |
| 参数名 | `model` | `llm` |
| 传给 supervisor | `agent.graph` | 直接传 agent |

**教训：** AI 框架半年迭代可能 API 大变样。保留原始文件 + 创建 fix 版是实用策略。

### 4.3 thinking 模型 reasoning_content

**现象：** `deepseek-v4-flash` 模型请求返回 400。
**根因：** thinking 模型返回额外的 `reasoning_content` 字段，LangGraph 内部传递消息时不会保留这个字段，DeepSeek API 要求后续调用必须原样传回。
**修复：** 通过 `modelKwargs: { thinking: { type: "disabled" } }` 关闭思考模式，或改用非 thinking 模型。

---

## 五、前端工程师对照表

| LangGraph 概念 | 前端类比 | 为什么像 |
|---------------|---------|---------|
| `Annotation.Root()` | Redux Store Schema | 定义共享数据结构和更新规则 |
| Node（节点函数） | Redux Reducer | 接收 state，返回增量更新 |
| `addEdge(START, "A")` | 路由配置 | 声明"谁之后是谁" |
| `addConditionalEdges` | `switch-case` | 根据条件走不同分支 |
| 回边 | `while/for` | 节点指向自身构成循环 |
| checkpointer + thread_id | `localStorage` + `sessionId` | 跨 invoke 持久化状态，隔离会话 |
| `interrupt()` + `Command()` | `async Generator` + `yield` | 图暂停等外部输入，不阻塞线程 |
| `compile({ checkpointer })` | `configureStore({ middleware })` | 注入能力后"冻结"配置 |
| `createReactAgent` | 封装好的 SDK | 一行代码完成通用模式 |
| `createSupervisor` | API Gateway / 微服务网关 | 根据请求分给不同的后端服务 |
| `streamMode: "values"` | WebSocket 推送 | 每步状态自动推送 |

---

## 六、总结

从 `basic-graph.mjs` 到 `multi-agent-supervisor.mjs`，8 个文件完成了从"调一个 LLM"到"编排多个 LLM + 工具 + 人工"的进阶：

```
初始：model.invoke("杭州天气？")
     → LLM 可能胡说，因为没有工具

第一次升级：graph.invoke({ messages: [...] })
     → 图编排 LLM + 工具调用，拿真实数据

最终：supervisor → weather_agent → lookup_weather → 返回结果
     → 多个专业 Agent 协作，由调度员分配任务
```

LangGraph 本质上就是一个**声明式的图编排框架**——你定义节点和连线，它负责调度执行。

---

## 下一步

学习路径的后半程覆盖：
- 多 Agent 串行/混合编排（`multi-agent-pro-1/2`）
- SQLite 持久化（`checkpointer-sqlite`）
- 更复杂的 Human-in-the-loop 应用

但在深入之前，当前 8 篇已经覆盖了 LangGraph 的全部核心原语。接下来的学习将围绕"多个 Agent 如何协同工作"展开。
