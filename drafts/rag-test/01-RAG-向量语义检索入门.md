# 第 01 章：RAG 入门——把文档向量化，做真正的语义搜索

## 本章目标

- 理解为什么大模型会出现“幻觉”
- 理解 RAG（检索-增强-生成）的完整流程
- 理解为什么语义检索要靠向量，而不是只靠关键词
- 跑通 `hello-rag.mjs` 的最小 RAG 闭环

## 对应源码

- `examples/rag-test/src/hello-rag.mjs`

## 这章讲了什么

大模型的知识停留在训练数据时点。  
遇到“最新信息”或“企业私有知识”时，模型可能不知道，但仍可能编造答案（幻觉）。

RAG 的思路就是：

1. 先去知识库检索相关内容（Retrieval）
2. 把检索结果拼到 Prompt 里做增强（Augmented）
3. 再让 LLM 基于这些上下文生成回答（Generation）

## 为什么要向量检索

关键词检索只能匹配字面词，难以处理语义相关问题。  
RAG 要做“语义搜索”，通常会把文本转成向量，然后基于向量相似度（常见是余弦相似度）检索。

你这章里的二维类比非常好：

- 水果 / 苹果 / 香蕉 在向量空间更接近
- 水果 / 石头 距离明显更远

这就是“语义近 ≠ 词面近”的直观体现。

## 关键代码理解（`hello-rag.mjs`）

### 1) 两类模型分工

- `ChatOpenAI`：负责最终回答（生成）
- `OpenAIEmbeddings`：负责把文本转成向量（检索前处理）

两者是不同模型，不要混淆。

### 2) 构造知识库文档

代码里把故事拆成多个 `Document`，并附带 `metadata`（章节、角色、类型、情绪）。  
这一步的价值是：后续不仅能检索正文，也能结合元信息做过滤/解释。

### 3) 向量化并建检索器

```js
const vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings);
const retriever = vectorStore.asRetriever({ k: 3 });
```

- `fromDocuments`：把文档嵌入并存入向量存储
- `asRetriever({ k: 3 })`：每次返回最相关的 3 个文档片段

### 4) 检索 + 打分

代码用了两种方式：

- `retriever.invoke(question)`：拿可直接用于增强的文档
- `similaritySearchWithScore(question, 3)`：拿到文档及评分，便于观察检索质量

然后把检索到的片段拼成 `context`，注入 prompt 后交给 LLM 回答。

### 5) 增强 Prompt 再生成

这一段是 RAG 核心动作：

```text
问题 -> 检索相关文档 -> 拼接上下文 -> LLM 生成答案
```

所以最终答案不是“模型纯记忆”，而是“模型 + 外部知识”共同产物。

## 运行与验证

在 `examples/rag-test` 下运行：

```bash
npm test
# 或
node ./src/hello-rag.mjs
```

预期看到：

1. 检索出的 3 个文档片段（含相似度）
2. 模型基于这些片段生成的回答

## 本章易错点

- 误以为 Embedding 模型和 LLM 是一回事
- 检索片段 `k` 过大，导致上下文噪音变多
- 只做关键词搜索却称为“语义 RAG”
- 忽略文档切分质量（后续章节重点）
- 误读评分：不同向量库返回的 score 语义可能不同（相似度或距离）

## 一句话总结

> RAG 解决幻觉的关键，不是“让模型更聪明”，而是“先检索到对的知识，再让模型基于知识回答”。

## 下一步可继续优化

- 把内存向量库替换为持久化向量数据库（Milvus/PGVector/Chroma）
- 增加文档切分策略（chunk size / overlap）
- 增加检索后重排（rerank）提升命中质量
- 在回答中附上引用来源，提升可追溯性

