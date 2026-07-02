# LangChain 学习总结：AI Agent 第一阶段学习完成

## 为什么要用 LangChain

不同大模型的 API 格式不同——OpenAI 的 system prompt 在 `messages` 数组里，Anthropic 有独立的 `system` 字段，Google 用 `system_instruction`。如果不用框架，换个模型就要改一遍代码。

**LangChain 的 BaseChatModel 统一了这些差异**：

```js
const model = new ChatXxx({ ... });
await model.invoke(messages);  // 不管底层是什么模型，调用方式相同
```

国产模型兼容 OpenAI 格式时直接用 `ChatOpenAI` 改 `baseURL` 即可；专用模型用对应的 `ChatDeepSeek`、`ChatAnthropic` 等。

## 学过的七大组件

```
┌────────────────────────────────────────────────┐
│              LangChain 七大组件                  │
│                                                │
│  ① ChatModel       → 调用各种大模型               │
│  ② PromptTemplate  → 组件化管理 prompt            │
│  ③ OutputParser    → 控制输出格式（JSON/流式等）    │
│  ④ Tool / MCP      → 模型调用外部工具              │
│  ⑤ Memory          → 对话记忆（截断/总结/检索）     │
│  ⑥ RAG / Milvus    → 向量检索增强生成              │
│  ⑦ LCEL (Runnable) → 声明式组装 chain（胶水层）    │
└────────────────────────────────────────────────┘
```

### ① ChatModel — 统一的模型接口

所有模型用同一套 `invoke()` / `stream()` API。切换模型只需改实例化参数，不改业务逻辑。

### ② PromptTemplate — 组件化管理

| API | 场景 |
|-----|------|
| `PromptTemplate` | 基础占位符 |
| `ChatPromptTemplate` | 对话格式（system/human/ai） |
| `PipelinePromptTemplate` | 多模块组合 |
| `FewShotPromptTemplate` | 带示例 |
| `MessagesPlaceholder` | 插入对话历史 |

### ③ OutputParser — 输出控制

| Parser | 用途 |
|--------|------|
| `StringOutputParser` | 提取纯文本 |
| `StructuredOutputParser` | JSON Schema 约束 |
| `model.withStructuredOutput()` | **推荐**——自动选择最佳方案 |
| `JsonOutputToolsParser` | 解析 tool_call 流式片段 |

### ④ Tool / MCP — 外部工具调用

标准 Agent Loop：
```
LLM 判断需要调工具 → 返回 tool_calls（name + args）
  → 执行工具 → 结果包成 ToolMessage → 放回 messages
  → LLM 再判断 → 回答 or 继续调工具 → 循环
```

MCP Server 则是把工具做成标准化服务——任何兼容 MCP 的客户端都能接入。

### ⑤ Memory — 记忆策略

| 策略 | 做法 | 适用 |
|------|------|------|
| Buffer | 全量保留最近 N 轮 | 短对话 |
| Summary | 对历史做摘要 | 中长对话 |
| Vector | 向量检索相关历史 | 超长对话 |

实际项目通常组合使用——Buffer Window + Summary + 向量检索混合。

### ⑥ RAG / Milvus — 检索增强

```
文档 → Loader 加载 → Splitter 分块 → Embedding 向量化 → Milvus 存储
问题 → Embedding → Milvus 相似度搜索 → 召回 top K → LLM 生成回答
```

ChunkSize 是关键调参点——太小语义不完整，太大召回不精准。400-800 字是通常的甜区。

### ⑦ LCEL（Runnable）— 声明式组装

```js
const chain = prompt.pipe(model).pipe(parser);
await chain.invoke({ input: "..." });
```

用管道 (`pipe`) 把组件串起来，支持 `map`（批量）、`branch`（条件）、`retry`（重试）、`fallback`（兜底）等高级模式。**核心思想：把写逻辑变成组装零件。**

## 从组件到体系

七个组件不是孤立的——它们在实际项目中的关系：

```
用户输入 → PromptTemplate(②) 格式化
  → ChatModel(①) 推理
  → OutputParser(③) 结构化
  → Tool(④) 执行 → 结果返回 LLM
  → Memory(⑤) 更新对话历史
  → RAG(⑥) 补充知识检索
整个过程被 LCEL(⑦) 用 pipe 声明式串起
```

## 核心收获

- **LangChain 是桥，不是墙**——它统一了不同模型、不同工具的接口，切换成本从「重写逻辑」降到「改一行配置」
- **组件化思维**——每个组件只做一件事，LCEL 负责把他们串起来
- **先理解概念，再记 API**——OutputParser、Memory、RAG 背后的思想比具体类名重要
- **从 Demo 到生产**——NestJS 集成、Tool DI、定时任务、Docker 部署，是把 Agent 从脚本变成服务的必经之路
