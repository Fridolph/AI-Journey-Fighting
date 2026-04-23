# 第 02 章：Milvus + RAG 电子书语义检索实战

## 本章目标

- 把 Loader、Splitter、Embedding、Milvus、LLM 串成完整工程链路
- 用 `.epub` 电子书构建“可语义检索”的知识库
- 实现一个可以自然语言提问并生成回答的电子书助手

## 对应源码

- `examples/milvus-test/src/ebook-writer.mjs`
- `examples/milvus-test/src/ebook-query.mjs`
- `examples/milvus-test/src/ebook-reader-rag.mjs`

## 这章的核心流程（你可以记 3 步）

1. **写库（writer）**：加载电子书 -> 切块 -> 向量化 -> 存入 Milvus  
2. **检索（query）**：问题向量化 -> Milvus 相似度搜索 -> 返回相关片段  
3. **回答（reader-rag）**：把检索片段拼入 prompt -> LLM 生成最终答案

---

## 1) `ebook-writer.mjs`：把电子书写入 Milvus

### 数据结构（collection schema）

集合 `ebook_collection` 的字段包含：

- `id`：主键
- `book_id`：书籍业务 id（后续可和 MySQL 关联）
- `book_name`：书名
- `chapter_num`：第几章
- `index`：该章的第几个 chunk
- `content`：文本内容
- `vector`：向量字段（`FloatVector`, `dim = 1024`）

这部分和你之前理解的一致：`vector` 用于语义检索，其它是元信息。

### 入库步骤

1. `hasCollection` 判断集合是否存在  
2. 不存在就 `createCollection` + `createIndex`  
3. `loadCollection` 让集合进入可检索状态  
4. 用 `EPubLoader` 读取 epub（按章节）  
5. 再用 `RecursiveCharacterTextSplitter` 切成 500 字符块（含 overlap）  
6. 每个 chunk 做 embedding，批量 `insert` 进 Milvus

这是标准“离线建库”流程。

---

## 2) `ebook-query.mjs`：只做语义检索

### 做了什么

- 把 query（如“鸠摩智会什么武功？”）向量化
- 用 `MetricType.COSINE` 搜索 top-k
- 打印检索结果（score + 章节 + 内容）

### 关键意义

这一步验证的是“能不能召回相关证据”，还不是“最终回答质量”。

---

## 3) `ebook-reader-rag.mjs`：检索 + 生成

### 做了什么

1. 调用检索函数拿到相关片段  
2. 把片段组织为 `context`  
3. 构造带规则的 prompt（要求准确、可引用原文、无依据就说明）  
4. 调 `ChatOpenAI` 生成回答

### 这就是完整 RAG

> Milvus 负责找证据，LLM 负责基于证据组织答案。

---

## 本章你已经掌握的关键认知

- `.epub` 这类长文档不能直接入库，必须切块
- query 也必须向量化，才能和库里的向量比较
- 向量维度必须一致（schema dim = embedding dim）
- 电子书助手和企业文档助手流程完全一致，只是语料不同

---

## 与 MySQL 的关系（后续重点）

你提到的 `book_id` 很关键：  
Milvus 负责语义召回；MySQL 负责结构化业务信息（书籍、作者、分类、权限等）。  
真实项目里通常是 MySQL + Milvus 联动（双写或异步同步）。

---

## 一句话总结

> 这章不是在学“某个 API”，而是在学一个可复用的产品级模式：**离线建知识库 + 在线语义召回 + LLM 生成回答**。

