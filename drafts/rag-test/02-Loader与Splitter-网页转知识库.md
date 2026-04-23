# 第 02 章：Loader 与 Splitter——把网页内容变成可检索知识库

## 本章目标

- 理解为什么真实 RAG 不能只靠手写 `Document`
- 学会用 Loader 把外部内容（网页）转成 `Document`
- 学会用 Splitter 把大文档切成适合检索的 Chunk
- 跑通“加载 → 切分 → 向量化 → 检索 → 回答”的完整流程

## 对应源码

- `examples/rag-test/src/loader-and-splitter.mjs`
- `examples/rag-test/src/loader-and-splitter2.mjs`

## 这章核心变化

上一章是手写 `documents`。  
这一章开始接近真实业务：文档来自外部来源（网页），先转成 `Document`，再切分后进入 RAG。

## 关键代码理解

### 1) Loader：先把网页内容加载成 `Document`

在 `loader-and-splitter.mjs` 里使用了：

- `CheerioWebBaseLoader`（来自 `@langchain/community`）
- `selector: '.main-area p'` 只提取正文区域段落

这一步后得到的仍是 LangChain 标准 `Document[]`，只是数据来源不再是手写。

### 2) Splitter：把大文档切成小块

使用 `RecursiveCharacterTextSplitter`（`@langchain/textsplitters`）：

- `chunkSize`：每块最大字符数
- `chunkOverlap`：相邻块重叠字符数（减少语义断裂）
- `separators`：优先按 `。！？` 等边界切分

这就是“一个大文档 -> 多个 chunk 文档”。

### 3) 为什么要切分

如果不切分：

- 检索粒度太粗，命中不精准
- Prompt 容易过长，成本高
- 无关信息容易被一并带入，噪声变大

切分后，检索可以只拿“最相关的几个 chunk”，RAG 质量明显更稳定。

### 4) 完整 RAG 流程（`loader-and-splitter2.mjs`）

代码顺序是：

1. Loader 拉网页正文
2. Splitter 切 chunk
3. `MemoryVectorStore.fromDocuments(splitDocuments, embeddings)` 向量化入库
4. `similaritySearchWithScore(question, 2)` 检索 Top-2
5. 把检索片段拼进 prompt
6. `model.invoke(prompt)` 生成答案

## 你这节的重点理解（非常正确）

- `questions` 是业务问题列表
- `retriever.invoke(question)` / `similaritySearchWithScore` 产出的是“证据文档片段”，不是最终答案
- `context` 是把证据拼成增强上下文
- 最终回答由 LLM 基于增强上下文生成

## 关于 metadata 的作用

这节里打印的“元数据”主要用于：

- 追溯片段来源
- 调试检索是否合理
- 后续做过滤（比如只查某来源/时间段）

它不是“模型自动生成的答案”，而是你在 pipeline 里保留的文档属性信息。

## 一句话总结

> Loader 解决“知识从哪里来”，Splitter 解决“知识怎么切得适合检索”，两者是 RAG 工程化落地的第一步。

## 备注

- 你文中提到 `@langchain/text-splitters`，当前示例代码使用的是 `@langchain/textsplitters`（以本项目代码为准）。
- 本章示例暂未加入错误处理（学习阶段可先聚焦主流程）。

