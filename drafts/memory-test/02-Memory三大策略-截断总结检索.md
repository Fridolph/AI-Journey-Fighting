# 第 02 章：Memory 三大策略——截断、总结、检索

## 本章目标

- 理解为什么光有 `history` 还不够
- 掌握 Memory 的三种主流管理策略：截断、总结、检索
- 建立一个工程认知：Memory 不是某个固定类，而是你如何控制上下文进入模型

## 对应源码

- `examples/memory-test/src/memory/truncation-memory.mjs`
- `examples/memory-test/src/memory/summarization-memory.mjs`
- `examples/memory-test/src/memory/summarization-memory2.mjs`
- `examples/memory-test/src/memory/insert-conversations.mjs`
- `examples/memory-test/src/memory/retrieval-memory.mjs`

## 为什么还要做 Memory 管理

上一章讲的是：把消息存起来，下一轮继续喂给模型。  
但如果消息无限增长，token 总会超限。

所以仅仅“保存 history”不够，还要管理 history。

Memory 的三种主流策略就是：

1. 截断
2. 总结
3. 检索

## 1) 截断（Truncation）

对应源码：

- `truncation-memory.mjs`

### 两种截断方式

#### 按消息数量截断

最简单：只保留最近 N 条 message。

源码里直接：

- `allMessages.slice(-maxMessages)`

优点：

- 简单直接
- 不需要额外模型调用

缺点：

- 粗暴
- 可能直接丢掉关键上下文

#### 按 token 数量截断

源码里用了：

- `trimMessages(...)`
- `js-tiktoken` 来计算 token 数量

这比“按条数截断”更合理，因为真正限制上下文的是 token，不是消息条数。

### 适合场景

- 短对话
- 低成本
- 对历史依赖不强的场景

## 2) 总结（Summarization）

对应源码：

- `summarization-memory.mjs`
- `summarization-memory2.mjs`

### 核心思路

不是直接丢弃旧消息，而是：

1. 保留最近几条消息
2. 把更早的消息交给 LLM 做总结
3. 后续对话时带上“摘要 + 最近消息”

### 第一版：按消息数量触发

在 `summarization-memory.mjs` 中：

- 超过 `maxMessages`
- 保留最近 `keepRecent`
- 其余部分 `summarizeHistory(...)`

其中 `getBufferString(...)` 的作用是：

- 把 `HumanMessage / AIMessage` 格式化成更适合总结的对话文本

### 第二版：按 token 触发

在 `summarization-memory2.mjs` 中：

- 先统计总 token
- 超过阈值才触发总结
- 从后往前保留最近的一部分 token

这比按消息数更贴近真实产品。  
像 Cursor / Claude Code 的上下文压缩，本质就是这个思路。

### 总结策略的优点

- 比截断更保留历史信息
- token 成本比全量保留低很多

### 缺点

- 摘要会损失细节
- 摘要本身也可能有偏差

## 3) 检索（Retrieval）

对应源码：

- `insert-conversations.mjs`
- `retrieval-memory.mjs`

### 核心思路

不是“把所有历史都塞进去”，而是：

1. 把历史对话存入向量数据库
2. 当前问题来时，先做 embedding
3. 到 Milvus 里检索语义相关历史
4. 把这些相关历史拼进 prompt

这其实就是：

> **把 Memory 问题转成 RAG 问题。**

### `insert-conversations.mjs` 做了什么

- 创建 `conversations` collection
- 写入几轮历史对话
- 每轮对话格式化为一段文本后向量化
- 保存 `content / round / timestamp / vector`

### `retrieval-memory.mjs` 做了什么

1. 用户发问
2. 检索 Milvus 中语义相近的历史对话
3. 把这些历史对话作为上下文发给模型
4. 回答完成后，再把这轮新对话写回 Milvus

这就形成了一个闭环：

- 以前聊过的内容可被“语义回忆”
- 现在聊的新内容也继续进入记忆库

## 三种策略怎么理解

### 截断

- 最便宜
- 最粗暴

### 总结

- 在成本和信息保留之间折中

### 检索

- 更适合长会话、长期记忆、跨时间回忆

## 实战里常见组合

最常见的不是三选一，而是组合使用：

- 短期：截断 / 最近消息
- 中期：摘要
- 长期：Milvus 检索

例如：

- 当前窗口只保留最近若干轮
- 历史对话定期总结
- 摘要或历史片段存入向量数据库
- 需要时再 RAG 检索回来

## 本章关键结论

1. `ChatMessageHistory` 解决的是“存哪”。
2. 截断、总结、检索解决的是“怎么管”。
3. LangChain 旧版 memory API 被废弃，不代表 memory 不重要，而是鼓励你自己实现更灵活的策略。
4. 真正的 Memory 工程往往是多策略组合，不是单点方案。

## 一句话总结

> 做 AI Agent 的 Memory，本质不是让模型“自己记住”，而是你用截断、总结、检索三种策略，持续把“最有价值的上下文”送回模型。

