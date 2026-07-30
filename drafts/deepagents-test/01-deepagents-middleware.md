# DeepAgents Middleware 详解

> 日期：2026-07-30
> 对应示例：`examples/deepagents-test/`
> 前置知识：LangChain（基础组件）+ LangGraph（状态管理/循环路由/checkpointer）

---

## 一、DeepAgents 定位

先理清三个东西的关系：

| 层 | 类比 | 做什么 |
|---|------|--------|
| **LangChain** | 积木 | 提供 LLM、Tool、Retriever 等 AI 开发基础组件 |
| **LangGraph** | 蓝图 | 提供 StateGraph、循环路由、checkpointer 等底层工作流能力 |
| **DeepAgents** | 半成品房子 | 在 LangGraph 之上封装好的高阶 Agent 框架，内置 middleware 机制 |

你学 LangGraph 时写一个带记忆的 Agent，要手动管理 State、写路由逻辑、接 checkpointer。DeepAgents 的 `createAgent` 把这些都包好了，你只需要声明 middleware 就行。

**什么时候选哪个：**

```
原生 LangGraph  → 你需要极致自定义、底层深度控制时
DeepAgents      → 你需要快速落地复杂 Agent（深度调研、多步业务、多Agent协作）时
```

---

## 二、Middleware 基石：createMiddleware（`middleware-test.mjs`）

### 2.1 生命周期钩子

DeepAgents 的 middleware 提供了 4 个钩子，分别对应 Agent 执行的不同阶段：

```js
const loggingMiddleware = createMiddleware({
  name: "LoggingMiddleware",

  // 扩展 State 结构（你可以在 middleware 里存自己的状态）
  stateSchema: z.object({
    modelCallCount: z.number().default(0),
  }),

  // Agent 开始时触发（整个 agent.invoke 开始）
  beforeAgent: (state) => {
    console.log("[Logging] agent 开始，消息数:", state.messages.length);
  },

  // 每次模型调用前触发
  beforeModel: (state) => {
    console.log(`[Logging] 即将调用模型，已调用: ${state.modelCallCount} 次`);
  },

  // 每次模型返回后触发
  afterModel: (state) => {
    return { modelCallCount: state.modelCallCount + 1 };  // ← 更新 State
  },

  // Agent 结束时触发
  afterAgent: (state) => {
    console.log(`[Logging] agent结束，累计模型调用: ${state.modelCallCount} 次`);
  },
});
```

**State 扩展**：`stateSchema` 定义的字段会合并到 Agent 的 State 中，在 `afterModel` 里返回新值来更新它。

### 2.2 短路控制

`beforeModel` 可以返回 `jumpTo: "end"` 来提前结束 Agent 流程：

```js
const blockedContentMiddleware = createMiddleware({
  name: "BlockedContentMiddleware",
  beforeModel: {
    canJumpTo: ["end"],
    hook: (state) => {
      const last = state.messages.at(-1);
      if (text.includes("BLOCKED")) {
        return {
          messages: [new AIMessage("该请求已被拦截")],
          jumpTo: "end",    // ← 直接跳到 END，不再调用模型
        };
      }
    },
  },
});
```

**类比 LangGraph**：你在 LangGraph 里做短路控制需要写条件边（`conditional_edges`），在 DeepAgents 里一个 `canJumpTo` + `hook` 搞定。

---

## 三、Middleware 扩展 Tool + wrapToolCall（`middleware-test2.mjs`）

Middleware 不仅能加钩子，还能通过 `tools` 字段动态注册工具：

```js
const extendedToolsMiddleware = createMiddleware({
  name: "ExtendedToolsMiddleware",
  stateSchema: z.object({
    toolInvocationCount: z.number().default(0),
  }),
  tools: [getCurrentTime],   // ← 注册工具，Agent 自动可用
  wrapToolCall: async (request, handler) => {
    console.log(`[Tools] 即将执行: ${toolName}`, request.toolCall.args);

    const result = await handler(request);  // ← 执行原始 tool

    // 包装返回结果
    const wrapped = new ToolMessage({
      content: `${result.content}\n[wrapToolCall] 已包装`,
      tool_call_id: result.tool_call_id,
      name: result.name,
    });

    return new Command({
      update: {
        toolInvocationCount: request.state.toolInvocationCount + 1,
        messages: [wrapped],    // ← 用包装后的消息替换原始返回
      },
    });
  },
});
```

**`wrapToolCall` 的妙用：**

```txt
handler(request) → 调用原始 tool → 拿到原始结果
你在 handler 前后可以：
  1. 记录日志 / 打点
  2. 修改结果内容
  3. 注入额外 state 信息
  4. 重试 / 降级
```

**运行结果**：

```
用户: 给我当前时间
→ get_current_time
回复: 当前 UTC 时间是 2026-07-30T09:15:00.000Z
[wrapToolCall] 已由 ExtendedToolsMiddleware 包装
toolInvocationCount: 1
```

---

## 四、FilesystemMiddleware（`filesystem-agent.mjs`）

这个 middleware 给 Agent 提供一个虚拟文件系统，自动生成 `ls`、`read_file`、`write_file`、`edit_file` 等文件操作工具。

### 4.1 核心配置

```js
const workspaceDir = path.join(__dirname, "workspace");

const agent = createAgent({
  model,
  tools: [],    // ← 不需要自己写文件工具
  systemPrompt: "工作区根路径为 /。用 ls、read_file、write_file、edit_file 操作文件。",
  middleware: [
    createFilesystemMiddleware({
      backend: new FilesystemBackend({ rootDir: workspaceDir, virtualMode: true }),
      permissions,   // ← 权限控制
    }),
  ],
});
```

### 4.2 权限矩阵

```js
const permissions = [
  { operations: ["read"], paths: ["/secret.txt"], mode: "deny" },  // 禁止读 secret
  { operations: ["write"], paths: ["/todo.md"], mode: "allow" },    // 允许写 todo
  { operations: ["write"], paths: ["/**"], mode: "deny" },          // 其他路径禁止写
];
```

**匹配规则**：先匹配先生效。`/secret.txt` 的 deny 在第一个，优先于后面的 `/**` allow。

### 4.3 对比原生 LangGraph

```
原生 LangGraph：
  需要自己写 read_file、write_file 的 tool 函数
  需要自己实现文件权限检查逻辑
  需要自己处理路径安全（防止目录穿越）

DeepAgents FilesystemMiddleware：
  一行配置 → 4 个文件工具自动注入
  权限矩阵 → 声明式控制读写
  virtualMode: true → 自动隔离真实磁盘，防误删
```

---

## 五、SkillsMiddleware（`skills-agent.mjs`）

让 Agent 从 `skills.sh` 社区安装的 skill 库中加载能力。

### 5.1 安装 Skill

```bash
npx skills add github/awesome-copilot --skill excalidraw-diagram-generator -y
```

这会下载一个 skill 到 `.agents/skills/excalidraw-diagram-generator/SKILL.md`，里面包含了图表的生成指令。

### 5.2 加载到 Agent

```js
const backend = await LocalShellBackend.create({
  rootDir: ".",
  virtualMode: true,
  inheritEnv: true,
});

const agent = createAgent({
  model,
  tools: [],
  systemPrompt: "按 skills 库完成任务，需要时 read_file 对应 SKILL.md。",
  middleware: [
    createSkillsMiddleware({ backend, sources: [".agents/skills/"] }),
    createFilesystemMiddleware({ backend }),
  ],
});
```

**Skills 的执行逻辑：**

```
① Agent 接收用户请求（"画一张流程图"）
② SkillsMiddleware 自动尝试匹配 skill
③ 匹配到 excalidraw-diagram-generator → read_file 读取 SKILL.md
④ 按 skill 指令使用 FilesystemMiddleware 的文件工具
⑤ 生成 excalidraw 文件到输出目录
```

### 5.3 流式输出

这个示例还展示了 `streamEvents` 的用法：

```js
const stream = await agent.streamEvents(
  { messages: [new HumanMessage(prompt)] },
  { recursionLimit: 100 }
);

for await (const event of stream) {
  if (event.event === "on_chat_model_stream") {
    process.stdout.write(text);   // ← 流式输出 LLM 回答
  }
  if (event.event === "on_tool_start") {
    process.stdout.write(`\n\n→ ${name}\n\n`);  // ← 显示工具调用
  }
}
```

**类比 axios 转 fetch**：就像不同 HTTP 库的 API 差异，`streamEvents` 是 LangGraph 的流式事件 API。

---

## 六、SubAgentMiddleware（`subagent-agent.mjs`）★ 最实用

声明式子 Agent 调度，不用自己写路由。

### 6.1 声明子 Agent

```js
const subagents = [
  {
    name: "math-solver",
    description: "解小学应用题，用 calc、divide_evenly 列式计算",
    systemPrompt: "必须用 calc、divide_evenly 完成计算，不要心算。",
    tools: [calc, divideEvenly],
  },
  {
    name: "kid-tutor",
    description: "把 math-solver 的解法讲给家长听",
    systemPrompt: "你是辅导讲解子 Agent，面向小学生家长。使用短句。",
    tools: [],  // ← 讲解不需要工具
  },
  {
    name: "practice-maker",
    description: "出 2 道同类练习题",
    systemPrompt: "调用 make_similar_problem 至少 2 次",
    tools: [makeSimilarProblem],
  },
];
```

### 6.2 挂载到主 Agent

```js
const agent = createAgent({
  model,
  tools: [],
  systemPrompt: "通过 task 委派子 Agent，自己不解题不讲题不出题。",
  middleware: [
    createSubAgentMiddleware({
      defaultModel: model,
      subagents,
      generalPurposeAgent: false,  // ← 不创建通用 Agent，只走声明好的
    }),
  ],
});
```

### 6.3 执行流程

```
用户提问 → math-solver（解题）
              ↓ 任务委派
          kid-tutor（讲解）
              ↓ 任务委派
          practice-maker（出题）
              ↓ 汇总
          回复用户
```

**主 Agent 通过 `task` tool 委派**。每个子 Agent 有自己的 systemPrompt 和 tools，主 Agent 根据 description 判断委派给谁。

**对比原生 LangGraph：**

```
原生 LangGraph 实现多 Agent：
  → 手动建 4 个 StateGraph
  → 手动建 Supervisor 节点做路由
  → 手动处理子 Agent 的返回结果

DeepAgents SubAgentMiddleware：
  → 声明 [{ name, description, tools }] → 全自动
```

---

## 七、MemoryMiddleware（`memory-agent.mjs`）

长期记忆持久化到 Markdown 文件。

### 7.1 配置

```js
const agent = createAgent({
  model,
  tools: [],
  systemPrompt: [
    "工作区根路径为 /，可用 ls、read_file、write_file、edit_file。",
    "用户要求记住时，必须立刻 edit_file，并按类型写入对应文件：",
    "- /AGENTS.md：项目说明、技术栈、架构等",
    "- /memory/preferences.md：用户个人偏好",
  ].join("\n"),
  middleware: [
    createFilesystemMiddleware({ backend }),
    createMemoryMiddleware({
      backend,
      sources: ["/AGENTS.md", "/memory/preferences.md"],
    }),
  ],
});
```

### 7.2 工作原理

```txt
记忆写入流程：
  "请记住：我常用的包管理器是 pnpm。"
    ↓ Agent 调用 edit_file /memory/preferences.md
    ↓ 追加一行 "- 包管理器：pnpm"
    ↓ 文件持久化

记忆读取流程：
  "我常用什么包管理器？"
    ↓ Agent 调用 read_file /memory/preferences.md
    ↓ 看到 "包管理器：pnpm"
    ↓ 回复 "你常用 pnpm"

记忆分类：
  /AGENTS.md          → 项目事实（技术栈、架构、约定）
  /memory/preferences.md  → 用户偏好（语言、打包工具、回答风格）
```

### 7.3 对比 LangGraph Memory

```
LangGraph 的 Memory：
  用 checkpointer 存 session 级别的短期记忆
  session 结束就丢了

DeepAgents MemoryMiddleware：
  存到文件 → 跨 session 持久化
  分门别类 → AGENTS.md vs preferences.md
  可读可写 → 人能直接打开看
```

---

## 八、SummarizationMiddleware（`summarization-agent.mjs`）

上下文长度超过阈值时自动压缩摘要，避免 Token 溢出。

### 8.1 配置

```js
const agent = createAgent({
  model,
  tools: [],
  systemPrompt: "记住用户提到的关键事实。若看到「此前对话摘要」，请据此继续对话。",
  middleware: [
    createSummarizationMiddleware({
      model,               // ← 用 LLM 生成摘要
      backend,
      historyPathPrefix: "/conversation_history",
      summaryPrompt,       // ← 自定义摘要 Prompt
      trigger: { type: "messages", value: 8 },   // ← 8 条消息触发摘要
      keep:     { type: "messages", value: 4 },   // ← 保留最近 4 条
    }),
  ],
});
```

### 8.2 执行效果

```
第 1-4 条消息：正常对话
第 5-7 条消息：正常对话
第 8 条消息：触发摘要！
  → 前 4 条被压缩为摘要 → 写入 /conversation_history/session_xxx.md
  → Agent 的上下文变成：「摘要 + 第 5-8 条原始消息」

后续继续对话：
  LLM 看到「此前对话摘要」→ 基于摘要继续 → 不会遗忘早期事实
```

### 8.3 参数含义

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `trigger` | 触发摘要的条件（消息数 / Token 数） | 由模型 profile 推断 |
| `keep` | 摘要后保留多少条原始消息 | 由模型 profile 推断 |
| `summaryPrompt` | 生成摘要的 Prompt 模板 | 内置默认值 |
| `historyPathPrefix` | 摘要文件存储路径前缀 | `/conversation_history` |

**你之前踩过的坑**：LangGraph 写循环时上下文越堆越长，Token 消耗飙升。这个 middleware 直接把这个问题解决了——不需要你自己写截断/摘要逻辑。

---

## 九、总结：7 个 middleware 一览

| Middleware | 解决的问题 | 一行核心 |
|-----------|-----------|---------|
| **createMiddleware** | 在模型调用前后加逻辑、控制流程 | `beforeModel` / `afterModel` / `jumpTo: "end"` |
| **wrapToolCall** | 扩展/包装工具执行结果 | `handler(request)` → 改返回值 |
| **FilesystemMiddleware** | 给 Agent 文件操作能力 + 权限控制 | `permissions: [{ operations, paths, mode }]` |
| **SkillsMiddleware** | 加载社区 skill 库 | `sources: [".agents/skills/"]` |
| **SubAgentMiddleware** | 声明式子 Agent 调度 | `subagents: [{ name, description, tools }]` |
| **MemoryMiddleware** | 跨 session 长期记忆 | `sources: ["/AGENTS.md", "/memory/preferences.md"]` |
| **SummarizationMiddleware** | 自动上下文压缩防溢出 | `trigger: { type: "messages", value: 8 }` |

**核心认知**：middleware 是 `createAgent` 的扩展机制。你可以在模型调用前后、工具调用前后插入逻辑，修改 State、参数、返回值，甚至短路控制流程。DeepAgents 提供了一系列开箱即用的 middleware，覆盖了 Agent 开发最常见的需求。

相比之下，用原生 LangGraph 实现同样的功能，你需要：

```
FilesystemMiddleware  → 自己写 4 个 tool + 权限管理
SubAgentMiddleware    → 自己建多个 StateGraph + Supervisor 路由
MemoryMiddleware      → 自己接文件读写 + 记忆分类
SummarizationMiddleware → 自己写摘要逻辑 + 截断策略
```

**下节预告**：DeepAgents 的其他功能（Task 规划、Agent 编排等）。

---

*昇哥 · 2026年7月*
