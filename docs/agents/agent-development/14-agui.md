# AGUI 协议：Vercel AI SDK + LangChain 实现流式组件渲染

> 示例代码：`examples/agui-backend/`、`examples/agui-frontend/`

## 为什么需要 AGUI 协议

之前的 SSE 方案只能传纯文本流，前端收到的是无结构的字符串——无法区分「这段文字是 LLM 说的」还是「这段文字是工具调用的结果」。

AGUI 协议把每条消息的类型、来源、状态都编码进 JSON 结构，前端可以针对不同消息类型渲染不同 UI 组件。

```
之前的 SSE（纯文本流）：           AGUI 协议（结构化 JSON 流）：
data: 傍                           data: {"type":"text-delta","delta":"傍晚"}
data: 晚                           data: {"type":"tool-input-start","toolName":"web_search"}
前端只知道"有文字来了"             前端知道每条消息的语义 → 渲染不同组件
```

## 整体架构

```
前端 useChat(UIMessage[]) → POST /ai/chat
  → AiController.pipeUIMessageStreamToResponse()
    → AiService:
        toBaseMessages() — UIMessage[] → LangChain BaseMessage[]
        createAgent.tools([web_search, send_mail]).stream()
        toUIMessageStream() — LangChain Stream → Data Stream Protocol
  → SSE 写入 Response → 前端 useChat 解析 → parts 数组 → MessagePart 渲染
```

## 后端核心：三个关键变化

### 1. 用 `createAgent` 替代手写 Agent Loop

```ts
// 之前：手写 while(true) + tool_calls 判断 + 工具执行 + 消息追加（30行）
// 现在：createAgent 内部自动处理 ReAct 循环
this.agent = createAgent({
  model,
  tools: [this.webSearchTool, this.sendMailTool],
  systemPrompt: '你是 AI 助手...',
});
const lgStream = await this.agent.stream(
  { messages: lcMessages },
  { streamMode: ['messages', 'values'], recursionLimit: 30 },
);
```

### 2. 两个适配器函数

```ts
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';

const lcMessages = await toBaseMessages(messages);
// UIMessage[{role,parts}] → LangChain BaseMessage[]

return toUIMessageStream(lgStream);
// LangChain AsyncIterable → Data Stream Protocol UIMessageStream
```

### 3. Controller 简化

```ts
const stream = await this.aiService.stream(body.messages);
pipeUIMessageStreamToResponse({ response: res, stream });
// 一行搞定，不需要手动设置 Content-Type 和 SSE 格式
```

## 前端核心：useChat + parts 渲染

一条 assistant 消息的 `parts` 数组结构：

```ts
[
  { type: "text", text: "我来搜索一下" },
  { type: "tool-invocation", toolName: "web_search", state: "partial-call" },
  { type: "tool-invocation", toolName: "web_search", state: "result", result: {...} },
  { type: "text", text: "根据结果，今天北京..." },
]
```

Tool 组件的三种状态：

| state | 含义 | UI |
|-------|------|-----|
| `partial-call` | 参数流式传输中 | 加载动画 + 参数预览 |
| `output-available` | 结果返回 | 展示结果卡片 |
| `output-error` | 执行出错 | 错误卡片 |

## 与手写方案的对比

| | 之前 | AGUI |
|---|---|---|
| Agent Loop | 手写 while | `createAgent` |
| 工具执行 | 手动 if/else 分发 | 框架自动 |
| SSE 格式 | 纯文本 | Data Stream Protocol |
| 前端解析 | 手动 | `useChat` |
| UI | 只有文字 | 文字 + Tool 组件面板 |

## 核心思想

**把「能力」（LangChain Agent）和「协议」（Vercel AI SDK）解耦，各用各的强项，用适配器层连接。** 新增 Tool 时只需在后端添加 provider、前端添加组件分支，不改协议层——这是工程化 Agent 的标准思路。
