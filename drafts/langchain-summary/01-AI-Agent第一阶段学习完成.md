# LangChain 整体总结：AI Agent 第一阶段学习完成

## 为什么要用 LangChain

不同大模型的 API 格式不同：

| 模型 | System 消息位置 | 请求格式 |
|------|----------------|---------|
| OpenAI | `messages` 数组内 | `{ role: "system", content: "..." }` |
| Anthropic (Claude) | 独立 `system` 字段 | `{ system: "...", messages: [...] }` |
| Google Gemini | `system_instruction` 字段 | `{ contents: [...], system_instruction: {...} }` |

**LangChain 的 BaseChatModel 统一了这些差异**——用 `ChatOpenAI` / `ChatAnthropic` / `ChatGoogle` 等，调用方式完全相同：

```js
const model = new ChatXxx({ ... });
await model.invoke(messages);  // 无论什么模型，API 一样
```

---

## 学过的六大组件

```
┌────────────────────────────────────────────────────┐
│                  LangChain 六大组件                  │
│                                                    │
│  ① ChatModel       → 调用各种大模型                   │
│  ② PromptTemplate  → 组件化管理 prompt                │
│  ③ OutputParser    → 控制输出格式（JSON/XML/流式）     │
│  ④ Tool / MCP      → 模型调用外部工具                  │
│  ⑤ Memory          → 对话记忆（截断/总结/检索）         │
│  ⑥ RAG / Milvus    → 向量检索增强生成                  │
│                                                    │
│  ⑦ LCEL (Runnable) → 声明式组装 chain（胶水层）        │
└────────────────────────────────────────────────────┘
```

### ① ChatModel — 统一的模型接口

```js
// 国产模型兼容 OpenAI 格式，直接用 ChatOpenAI
const model = new ChatOpenAI({
  modelName: 'qwen-plus',      // 千问
  configuration: { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
});

// 但如果要用模型特有功能，就用专门的 ChatModel 类
import { ChatDeepSeek } from '@langchain/deepseek';
import { ChatAnthropic } from '@langchain/anthropic';
```

### ② PromptTemplate — 组件化管理

| API | 场景 |
|-----|------|
| `PromptTemplate` | 基础占位符填充 |
| `ChatPromptTemplate` | 对话形式（system/human/ai） |
| `PipelinePromptTemplate` | 多模块组合（人设/任务/格式） |
| `FewShotPromptTemplate` | 带少量示例 |
| `MessagesPlaceholder` | 插入对话历史 |
| `LengthBasedExampleSelector` | 按长度选示例 |
| `SemanticSimilarityExampleSelector` | 按语义选示例 |

### ③ OutputParser — 输出控制

| Parser | 用途 |
|--------|------|
| `StringOutputParser` | 提取纯文本 |
| `StructuredOutputParser` | JSON Schema 约束输出 |
| `XMLOutputParser` | XML 格式 |
| `JsonOutputToolsParser` | 解析 tool_call 流式片段 |
| `model.withStructuredOutput()` | 自动选 tool_call/json_schema，推荐 |

### ④ Tool / MCP — 外部工具调用

标准 Agent Loop 循环：
```
LLM 判断需要调工具 → 返回 tool_calls（含 name + args）
  → 执行工具 → 结果包成 ToolMessage → 放回 messages
  → 再次调 LLM → 直到没有 tool_call → 返回最终结果
```

MCP（Model Context Protocol）是通用工具协议，复用已有工具：
```js
const client = new MultiServerMCPClient({ mcpServers: {...} });
const tools = await client.getTools();
const modelWithTools = model.bindTools(tools);
```

### ⑤ Memory — 对话记忆

三种管理策略：
- **截断**：去掉旧的 message
- **总结**：LLM 生成摘要替代旧消息
- **检索**：向量数据库捞相关历史

`MessagesPlaceholder('history')` + `messages[]` 数组管理。

### ⑥ RAG — 检索增强生成

```
文档 → Loader → Splitter → Embedding → Milvus（存入）
                        ↓
用户问题 → Embedding → Milvus.search（相似度检索）→ 拼接 context → Prompt → LLM → 回答
```

---

## ⑦ LCEL — 声明式组装

从「命令式调用」变成「声明式组装 chain」：

```js
// 命令式
const p = await prompt.format(input);
const r = await model.invoke(p);
const o = await parser.invoke(r);

// 声明式（LCEL）
const chain = prompt.pipe(model).pipe(parser);
const o = await chain.invoke(input);
```

### Runnable API 速查

| API | 作用 | 类比 |
|-----|------|------|
| `RunnableSequence` / `.pipe()` | 顺序串联 | 管道 |
| `RunnableMap` | 并行执行 | `Promise.all` |
| `RunnableBranch` | 条件分支 | if-else |
| `RouterRunnable` | 路由分发 | switch-case |
| `RunnableLambda` | 自定义逻辑 | 万能适配器 |
| `RunnablePassthrough` | 透传数据 | `Object.assign` |
| `RunnableEach` | 循环数组 | `Array.map` |
| `RunnablePick` | 取属性 | 对象解构 |
| `RunnableWithMessageHistory` | 加记忆 | Memory |

### 三种统一调用

```js
await chain.invoke(input)         // 同步
await chain.batch([i1, i2])       // 批量
for await (const c of await chain.stream(input))  // 流式
```

### 节点增强（横向切面）

```js
model.withRetry({ stopAfterAttempt: 3 })       // 重试
chain.withFallbacks({ fallbacks: [...] })      // 降级
chain.withConfig({ configurable: {...} })      // 传参
chain.invoke(input, { callbacks: [...] })      // 观测
```

---

## LCEL 开发三步走

```
① 分析流程，拆成原子步骤
② 根据步骤关系选 Runnable：
    顺序 → Sequence  并行 → Map  分支 → Branch  自定义 → Lambda
③ 统一调用：invoke / stream / batch
④ 按需增强：withRetry / withFallbacks / withConfig / callbacks
```

---

## 学习成果盘点

| 阶段 | 内容 | 状态 |
|------|------|------|
| Prompt Template | 组件化管理 prompt | ✅ |
| Output Parser | 结构化输出、流式解析 | ✅ |
| Tool Calling | bindTools + Agent Loop | ✅ |
| Memory | 对话记忆三种策略 | ✅ |
| RAG + Milvus | 向量检索增强生成 | ✅ |
| LCEL (Runnable) | 声明式组装 chain | ✅ |
| MCP | 复用外部工具 | ✅ |
| 心智模型 | AI 开发思维框架 | ✅ |
| 实战练习 | fri/ + practice/ step1~8 | ✅ |

## 下一步

LangGraph — 基于 Runnable 的有状态工作流引擎。Agent Loop 的 for 循环升级为显式状态图。
