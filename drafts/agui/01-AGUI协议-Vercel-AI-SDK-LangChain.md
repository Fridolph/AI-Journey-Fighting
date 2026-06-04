# AGUI 协议：Vercel AI SDK + LangChain 实现流式组件渲染

## 为什么需要 AGUI 协议

```
之前的 SSE（纯文本流）：               AGUI 协议（结构化 JSON 流）：
─────────────────────────              ─────────────────────────
data: 傍                               data: {"type":"text-delta","delta":"傍晚"}
data: 晚                               data: {"type":"tool-input-start","toolName":"web_search"}
前端只知道"有文字来了"                  data: {"type":"tool-output-available","output":{...}}
无法区分文本 vs 工具调用               前端知道每条消息的语义 → 渲染不同组件
```

## 整体架构

```
前端 useChat(UIMessage[]) → POST /ai/chat
  → AiController.pipeUIMessageStreamToResponse()
    → AiService:
        toBaseMessages() — UIMessage[] → LangChain BaseMessage[]
        createAgent.tools([web_search, send_mail]).stream()
        toUIMessageStream() — LangChain Stream → Data Stream Protocol
  → SSE 写入 Response
    → 前端 useChat 解析 → parts 数组 → MessagePart 渲染
```

---

## 后端核心：三个关键变化

### 1. 不再手写 Agent Loop — `createAgent` 一行搞定

```ts
// 之前：手写 while(true) + tool_calls 判断 + 工具执行 + 消息追加（30行）
// 现在：
this.agent = createAgent({
  model,
  tools: [this.webSearchTool, this.sendMailTool],
  systemPrompt: '你是 AI 助手...',
});
// 内部自动处理 ReAct 循环，recursionLimit 防止死循环
const lgStream = await this.agent.stream(
  { messages: lcMessages },
  { streamMode: ['messages', 'values'], recursionLimit: 30 },
);
```

### 2. 两个适配器函数 — UIMessage ↔ LangChain 的桥梁

```ts
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';

const lcMessages = await toBaseMessages(messages);
// UIMessage[{role,parts[{type:"text"}]}] → BaseMessage[HumanMessage, AIMessage, ToolMessage]

return toUIMessageStream(lgStream);
// LangChain AsyncIterable → Data Stream Protocol UIMessageStream
```

### 3. Controller 简化 — pipeUIMessageStreamToResponse

```ts
// 之前：手设 Content-Type、手写 data:\n\n
// 现在：
const stream = await this.aiService.stream(body.messages);
pipeUIMessageStreamToResponse({ response: res, stream });
```

---

## 前端核心：useChat + parts 渲染

### Message 结构

```ts
interface UIMessage {
  id: string; role: 'user' | 'assistant';
  parts: Part[];  // 核心：一条消息可有多个 part
}
// Part = text | tool-invocation
```

```
一条 assistant 消息的 parts 真实结构：
[
  { type: "text", text: "我来搜索一下" },
  { type: "tool-invocation", toolName: "web_search", state: "partial-call" },
  { type: "tool-invocation", toolName: "web_search", state: "result", result: {...} },
  { type: "text", text: "根据结果，今天北京..." },
]
```

### 渲染逻辑

```tsx
parts.map(part => {
  if (part.type === 'text') return <StreamdownText>{part.text}</StreamdownText>;
  if (isToolUIPart(part)) return <ToolMessagePart part={part} />;
})

// ToolMessagePart 内部按 toolName 分发：
switch (name) {
  case 'web_search': return <WebSearchToolPanel input={...} output={...} />;
  case 'send_mail':   return <SendMailToolPanel input={...} output={{...}} />;
  default: return <DefaultToolOutput value={...} />;
}
```

### Tool 组件的三种状态

| state | 含义 | UI |
|-------|------|----|
| `partial-call` | 参数流式传输中 | 搜索旋转 + 参数预览 |
| `call` / `input-available` | 参数完整，等待执行 | 显示完整参数 |
| `output-available` | 结果返回 | 展示结果卡片（WebSearchPanel） |
| `output-error` | 执行出错 | 错误卡片 |

---

## 与之前手写方案的对比

| | 之前 | AGUI |
|--|------|------|
| Agent Loop | 手写 while | `createAgent` |
| 工具执行 | 手动 if/else 分发 | 框架自动 |
| SSE 格式 | 纯文本 | Data Stream Protocol |
| 前端解析 | 手动 | `useChat` |
| UI | 只有文字 | 文字 + Tool 组件 |
| 代码量 | ~300 行 service | ~40 行 service |

---

## 新增 Tool 的标准流程

```
后端：AiModule 添加 provider（tool + schema）→ AiService 传给 createAgent
前端：ToolPanels.tsx 加一个 toolName 分支 → 返回自定义组件
不需要改 Controller、SSE 逻辑、协议层
```

## 核心思想

**把"能力"（LangChain Agent）和"协议"（Vercel AI SDK）解耦，各用各的强项，用适配器层连接。** 这是工程化 Agent 的标准思路。
