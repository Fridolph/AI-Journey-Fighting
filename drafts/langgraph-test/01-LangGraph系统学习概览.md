# LangGraph 系统学习概览

## 学习背景

在完成 `advanced-rag`（LangGraph + Agentic RAG 路由）的学习后，我们进入了 LangGraph 专题的系统学习阶段。

`advanced-rag` 阶段已经接触了 LangGraph 的核心概念——StateGraph、条件路由、工具节点等，但当时是**以 RAG 为主线**，LangGraph 只是作为路由编排工具。现在是**以 LangGraph 为主线**，系统性覆盖它的各类能力：从基础图结构到持久化、中断/恢复、预构建 Agent，再到多 Agent 编排。

## 文件分层与学习路线图

```
基础层（3 个）                    ← 已跑通，无需 API key
├── basic-graph.mjs              StateGraph 三要素（State/Node/Edge）
├── conditional-routing.mjs      条件路由（addConditionalEdges）
└── loop-retry.mjs               循环/重试模式（自环边）

持久化层（2 个）                  ← 无需 API key，可先跑
├── checkpointer-memory.mjs      MemorySaver 内存持久化
└── checkpointer-sqlite.mjs      SqliteSaver 磁盘持久化

人机交互层（2 个）                ← 交互式，需终端手动输入
├── graph-interrupt.mjs          中断/恢复（interrupt + Command）
└── graph-interrupt-pro.mjs      中断进阶（多轮交互 + 金额校验）

预构建层（2 个）                  ← 需要 API key（DeepSeek）
├── prebuilt-tool-node.mjs       ToolNode + toolsCondition
└── prebuilt-agent.mjs           createAgent（含 MemorySaver）

多智能体层（4 个）                ← 需要 API key + 部分有兼容问题
├── multi-agent-supervisor.mjs       Supervisor 基础（有兼容 bug）
├── multi-agent-supervisor-fix.mjs   Supervisor 修复版（thinking disabled）
├── multi-agent-pro-1.mjs            多 Agent 串行版（含易经 Agent）
└── multi-agent-pro-2.mjs            多 Agent 混合并行/串行版

辅助模块（2 个）
├── simple-mock.mjs              天气/城市趣味知识模拟 API
└── inventory-mock.mjs           库存模拟 API
```

### 学习建议顺序

1. **基础层**（已跑通）→ 理解 StateGraph 核心模式
2. **持久化层**（无需 API key，推荐先跑）→ 理解 checkpointer 机制
3. **人机交互层**（需终端交互）→ 理解 interrupt/Command
4. **预构建层**（需 API key）→ 理解 ToolNode + createAgent
5. **多智能体层**（需 API key + 兼容处理）→ 理解 Supervisor 编排

---

## 基础层：运行结果与关键代码理解

### 1. basic-graph.mjs — StateGraph 三要素

**核心知识点：**
- `Annotation.Root()` 定义 State 结构
- `reducer` 控制状态更新方式（`(_prev, next) => next` 表示直接替换）
- `addNode("name", fn)` 注册节点
- `addEdge(START, "node")` / `addEdge("node1", "node2")` / `addEdge("node2", END)` 连接

**运行结果：**
```
result: { text: 'hello -> step1 -> step2' }
```
hello 经 step1 → step2 两次拼接，完全符合预期。

**关键代码：**
```javascript
const StateAnnotation = Annotation.Root({
  text: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

const graph = new StateGraph(StateAnnotation)
  .addNode("step1", step1)
  .addNode("step2", step2)
  .addEdge(START, "step1")
  .addEdge("step1", "step2")
  .addEdge("step2", END)
  .compile();
```

### 2. conditional-routing.mjs — 条件路由

**核心知识点：**
- `addConditionalEdges("node", routerFn, routeMap)` 条件路由
- routerFn 返回路由名称，routeMap 做名称→节点映射
- 核心模式：用 router 节点判断 → 走到不同的子节点

**运行结果：**
```
result: { query: '你好', route: 'chat', answer: '你说的是：你好' }
result: { query: '10 * 8', route: 'math', answer: '80' }
```
"你好" → chat 分支（echo）；"10 * 8" → math 分支（eval 计算）。

**关键代码：**
```javascript
.addConditionalEdges("router", (state) => state.route, {
  math: "math",
  chat: "chat",
})
```

### 3. loop-retry.mjs — 循环/重试模式

**核心知识点：**
- 条件路由指向**自身节点**可实现循环（自环边）
- 状态机模式：用 state 字段控制循环退出条件

**运行结果：**
```
result: { tries: 3, ok: true, message: '第 3 次成功' }
```
retry 分支指向 attempt 自身，循环 3 次后 done 分支走到 END。

**关键代码：**
```javascript
.addConditionalEdges("attempt", (state) => (state.ok ? "done" : "retry"), {
  retry: "attempt",      // ← 自环：回到自身
  done: END,
})
```

---

## 后续 4 层的初步印象

### 持久化层（checkpointer-memory / checkpointer-sqlite）

两个文件的图和逻辑几乎相同——每次 invoke 让 visitCount +1。区别是 checkpointer 的实现：
- **MemorySaver**：进程内内存，进程重启后丢失
- **SqliteSaver**：持久化到 `.sqlite` 文件，跨进程/跨重启保留

关键 API：`graph.compile({ checkpointer })`，invoke 时传入 `{ configurable: { thread_id: "xxx" } }` 区分会话。

### 人机交互层（graph-interrupt / graph-interrupt-pro）

LangGraph 的特色能力：用 `interrupt()` 在图中暂停，等待外部输入后通过 `Command({ resume: value })` 恢复。

- **基础版**：单次 interrupt，终端等待用户确认
- **进阶版**：多轮 interrupt（金额输入 → 校验 → 确认 → 扣款），带条件回边（金额非法时重问）

这层展示了 LangGraph 在**人机协作场景**中的强大能力——agent 不再是"跑一次就出结果"，而是可以等待并响应人类输入。

### 预构建层（prebuilt-tool-node / prebuilt-agent）

- **ToolNode**：LangGraph 预构建的工具调用节点，与 `toolsCondition` 配合——agent 输出 tool_calls 就路由到 ToolNode，否则直接 END
- **createAgent**：`langchain` 包提供的高级封装，一行代码创建完整的 ReAct agent

两者都依赖 LLM API（当前配置为 DeepSeek），需要 API key 才能跑。

### 多智能体层（4 个文件）

这层是本专题最复杂的部分，涵盖 Supervisor 编排模式：

| 文件 | 特点 | 状态 |
|------|------|------|
| `multi-agent-supervisor.mjs` | 基础 Supervisor | 有兼容 bug（未关 thinking） |
| `multi-agent-supervisor-fix.mjs` | 修复版 | 关闭 thinking + 串行调度 |
| `multi-agent-pro-1.mjs` | 串行版 + 易经 Agent | 三个 Agent 依次串行 |
| `multi-agent-pro-2.mjs` | 混合并行/串行 | weather + trivia 并行 → iching 串行 |

核心思路：Supervisor 作为"调度员"，根据用户问题选择子 Agent 执行，子 Agent 结果再流回 Supervisor。`multi-agent-supervisor-fix` 修复了几个兼容问题后才跑通，这也是后续重点深入的方向。

---

## 环境说明

当前 `.env` 配置：

| 变量 | 值 | 说明 |
|------|-----|------|
| `OPENAI_API_KEY` | sk-b57e09991bb64737be5f2bfab718f515 | 实际为 DeepSeek key |
| `OPENAI_BASE_URL` | https://api.deepseek.com | DeepSeek API 端点 |
| `MODEL_NAME` | deepseek-v4-flash | 当前使用的模型 |

**注意**：`.env` 中的 `OPENAI_API_KEY` 实际使用的是 DeepSeek 的 key 和 base URL，ChatOpenAI 类通过这个配置接 DeepSeek 的 API。需要确认 `deepseek-v4-flash` 模型名称是否有效（DeepSeek 官方模型名通常为 `deepseek-chat`）。

---

## 下一步建议

1. **跑持久化层**：两个文件都不需要 API key，可直接运行验证
2. **尝试人机交互层**：手动输入体验 interrupt/Command 机制
3. **配置好 LLM 后跑预构建层**：确认 API key 和模型名称有效后跑通
4. **深入多智能体层**：从 `multi-agent-supervisor-fix` 开始，理解 Supervisor 编排模式
5. 为每个深入的文件创建 `*-learning.mjs` 学习版（加详细注释）
6. 每个层级产出一篇独立学习记录
