/Users/fri/Desktop/github/AI-Journey-Fighting/examples/output-parser-test/src/test/mini-cursor.mjs

这段代码实现了一个最小可运行的 AI Agent，核心思想是：

用户任务
  ↓
LLM 思考 → 决定调用哪个工具
  ↓
执行工具 → 把结果喂回 LLM
  ↓
LLM 继续思考 → 再次决定...
  ↓
直到 LLM 认为任务完成，不再调用工具
  ↓
返回最终回答

这就是 ReAct 模式（Reasoning + Acting）的最小实现。

---

## 第一部分：模型初始化

> 为什么要禁用 thinking mode？

DeepSeek thinking mode 的多轮工具调用协议：

第1轮：
  assistant 返回 {
    reasoning_content: "我先想想...",   ← DeepSeek 专有字段
    content: "",
    tool_calls: [{ name: "read_file" }]
  }

第2轮（你必须把上面的完整内容原样传回）：
  messages: [
    ...,
    { role: "assistant", reasoning_content: "我先想想...", tool_calls: [...] },
    { role: "tool", content: "文件内容" }
  ]

LangChain 的 AIMessage 不会自动保留 reasoning_content
→ 传回去时缺少这个字段
→ DeepSeek API 返回 400 错误

### 工具绑定

```ts
const tools = [readFileTool, writeFileTool, executeCommandTool, listDirectoryTool];
const modelWithTools = model.bindTools(tools);
```

bindTools() 做了什么？

把每个 tool 的 schema（名称、描述、参数定义）
序列化成 OpenAI function calling 格式：

```ts
{
  "type": "function",
  "function": {
    "name": "read_file",
    "description": "读取文件内容",
    "parameters": {
      "type": "object",
      "properties": {
        "filePath": { "type": "string" }
      }
    }
  }
}
```

然后在每次调用 LLM 时，把这个 schema 列表附在请求里
→ LLM 就知道"我有哪些工具可以用"


## 第二部分：runAgentWithTools() — Agent 主循环

```ts
// 初始化
async function runAgentWithTools(query, maxIterations = 30) {
    const history = new InMemoryChatMessageHistory();
    // ...
}
```

InMemoryChatMessageHistory 是 LangChain 提供的内存消息历史，本质上就是一个数组的封装，提供 addMessage / getMessages 接口。

maxIterations = 30 — 最大循环次数，防止 Agent 陷入死循环无限调用工具。

### System Prompt 设计

```ts
await history.addMessage(new SystemMessage(`你是一个项目管理助手，使用工具完成任务。

当前工作目录: ${process.cwd()}

重要规则 - execute_command：
- workingDirectory 参数会自动切换到指定目录
- 当使用 workingDirectory 时，绝对不要在 command 中使用 cd
- 错误示例: { command: "cd react-todo-app && pnpm install", workingDirectory: "react-todo-app" }
- 正确示例: { command: "pnpm install", workingDirectory: "react-todo-app" }
`));
```

System Prompt 里有两类信息：

环境信息（让 LLM 知道上下文）：
  - 当前工作目录
  - 有哪些工具

行为约束（防止 LLM 犯常见错误）：
  - 不要在 command 里用 cd（因为有 workingDirectory 参数）
  - write_file 时要补 CSS import

这些约束是从实际运行中踩坑总结出来的，
没有它们 LLM 会经常生成 "cd xxx && pnpm install" 这种错误命令。

### Agent 主循环

```ts
for (let i = 0; i < maxIterations; i++) {
    const messages = await history.getMessages();
    const rawStream = await modelWithTools.stream(messages);
    // ...
}
```

每次循环：

- 取出完整消息历史
- 把历史全部发给 LLM（包含之前所有工具调用和结果）
- 流式接收 LLM 的响应

### 流式输出处理

```ts
let fullAIMessage = null;
const toolParser  = new JsonOutputToolsParser();
const printedLengths = new Map();   // key: toolCallId, value: 已打印字符数

for await (const chunk of rawStream) {
    // 1. 累积完整消息
    fullAIMessage = fullAIMessage ? fullAIMessage.concat(chunk) : chunk;

    // 2. 尝试解析当前累积的工具调用
    let parsedTools = null;
    try {
        parsedTools = await toolParser.parseResult([{ message: fullAIMessage }]);
    } catch (e) {
        // JSON 还不完整，忽略，继续累积
    }
    // ...
}
```

这里有一个流式解析的核心技巧：

LLM 流式输出工具调用时，JSON 是逐字符吐出来的：

chunk1: { "name": "write_
chunk2: file", "args": { "
chunk3: filePath": "App.tsx
chunk4: ", "content": "imp
...

每个 chunk 单独都不是合法 JSON
→ 必须先 concat 累积
→ 每次尝试解析，失败就继续累积
→ 直到 JSON 完整才能解析成功

printedLengths Map 用于流式预览 write_file 的内容：

```ts
if (toolCall.type === 'write_file' && toolCall.args?.content) {
    const toolCallId = toolCall.id || toolCall.args.filePath || 'default';
    const currentContent  = String(toolCall.args.content);
    const previousLength  = printedLengths.get(toolCallId);

    if (previousLength === undefined) {
        // 第一次见到这个工具调用，打印 header
        printedLengths.set(toolCallId, 0);
        console.log(`\n[工具调用] write_file("${toolCall.args.filePath}") - 开始写入\n`);
    }

    if (currentContent.length > previousLength) {
        // 只打印新增的部分（增量输出）
        const newContent = currentContent.slice(previousLength);
        process.stdout.write(newContent);
        printedLengths.set(toolCallId, currentContent.length);
    }
}

// 第1次解析成功时：content = "import React"    → 打印 "import React"
// 第2次解析成功时：content = "import React\nco" → 只打印 "\nco"（增量）
// 第3次解析成功时：content = "import React\nconst" → 只打印 "nst"（增量）
```

### 工具执行

```ts
// 流结束后，fullAIMessage 已完整
await history.addMessage(fullAIMessage);

// 没有工具调用 → 任务完成
if (!fullAIMessage.tool_calls || fullAIMessage.tool_calls.length === 0) {
    return fullAIMessage.content;
}

// 有工具调用 → 执行每个工具
for (const toolCall of fullAIMessage.tool_calls) {
    const foundTool = tools.find(t => t.name === toolCall.name);
    if (foundTool) {
        const toolResult = await foundTool.invoke(toolCall.args);
        await history.addMessage(new ToolMessage({
            content:      toolResult,
            tool_call_id: toolCall.id,    // ← 必须和 tool_call 的 id 对应
        }));
    }
}
// 继续下一轮循环，把工具结果喂给 LLM
```

tool_call_id 的作用：

LLM 可能同时发出多个工具调用：
  tool_calls: [
    { id: "call_001", name: "read_file",  args: { filePath: "a.txt" } },
    { id: "call_002", name: "list_directory", args: { path: "." } },
  ]

每个 ToolMessage 必须带上对应的 id：
  ToolMessage { tool_call_id: "call_001", content: "a.txt 的内容" }
  ToolMessage { tool_call_id: "call_002", content: "目录列表" }

这样 LLM 才知道哪个结果对应哪个工具调用


### 完整的消息历史结构

经过几轮循环后，history 里的消息长这样：

SystemMessage:   "你是项目管理助手..."
HumanMessage:    "创建一个 React TodoList..."
AIMessage:       tool_calls: [{ name: "execute_command", args: { command: "pnpm create vite..." } }]
ToolMessage:     tool_call_id: "call_001", content: "✔ Done. Now run..."
AIMessage:       tool_calls: [{ name: "write_file", args: { filePath: "App.tsx", content: "..." } }]
ToolMessage:     tool_call_id: "call_002", content: "文件写入成功"
AIMessage:       tool_calls: [{ name: "execute_command", args: { command: "pnpm install" } }]
ToolMessage:     tool_call_id: "call_003", content: "dependencies installed"
AIMessage:       content: "已完成所有任务！..."   ← 无 tool_calls，循环结束
