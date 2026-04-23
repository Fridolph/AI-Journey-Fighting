# 第 01 章：Milvus 向量数据库与 RAG 实战

## 本章目标

- 理解为什么 AI Agent 项目要用 Milvus，而不只用 MySQL
- 跑通 Milvus 的增删改查（insert / query / upsert / delete）
- 把 Milvus 检索结果接入 RAG，形成“检索增强生成”完整链路

## 对应源码

- `examples/milvus-test/src/insert.mjs`
- `examples/milvus-test/src/query.mjs`
- `examples/milvus-test/src/rag.mjs`
- `examples/milvus-test/src/update.mjs`
- `examples/milvus-test/src/delete.mjs`
- 扩展案例（电子书）：`ebook-writer.mjs` / `ebook-query.mjs` / `ebook-reader-rag.mjs`

## 为什么要 Milvus

MySQL 擅长精确查询（id、条件、关联表）。  
Milvus 擅长语义查询（自然语言 -> 向量相似度检索）。

真实 AI Agent 场景通常两者都要：

- 业务结构化数据：MySQL
- 知识/记忆语义检索：Milvus

常见工程策略是“双写”：同一条业务数据同时维护结构化存储和向量存储。

## 本章主线（你可以记住这 4 步）

1. 定义 collection schema（含向量字段）
2. 文本经 embedding 转向量后写入 Milvus
3. query 也向量化，在 Milvus 里做相似度搜索
4. 把检索结果放进 prompt，再交给 LLM 生成回答

## 关键代码理解

### 1) 插入（insert.mjs）

- collection：`ai_diary`
- schema 字段：`id/vector/content/date/mood/tags`
- 向量字段类型：`FloatVector`，维度 `1024`
- 检索索引：`IVF_FLAT + COSINE`

插入前先把每条日记 `content` 做 embedding，再连同元信息一起写入。

### 2) 查询（query.mjs）

查询流程不是关键词匹配，而是：

- 把用户 query 向量化
- 调 `client.search(...)` 做余弦相似度检索
- 返回最相近的若干条日记（含 score + 元信息）

这就是“语义搜索”的核心差异。

### 3) RAG（rag.mjs）

完整链路：

- `retrieveRelevantDiaries`：从 Milvus 取 top-k 相关日记
- 拼接 `context`
- 生成增强 prompt
- `model.invoke(prompt)` 输出答案

这一套就是产品里常见的“知识库问答”最小闭环。

### 4) 更新与删除

- 更新：`upsert`（带 id，重新写 content + 新向量）
- 删除：`delete` + `filter`（可按 id 或条件批量删除）

注意：删除不需要 embedding；更新 content 必须重算向量。

## Milvus 数据层心智模型

可以理解为三级结构：

- `database`
- `collection`
- `entity`（具体数据行）

和关系型数据库很像，但多了向量字段和向量索引。

## 本章易错点

- 向量维度不一致（schema dim 与 embedding 输出维度必须一致）
- 忘记给向量字段建索引导致检索慢
- 更新文本后没重算 embedding，导致“内容和向量不一致”
- 集合未加载就搜索
- 把 Milvus 当成 MySQL 使用（只做精确过滤，不做语义检索）

## 一句话总结

> Milvus 是 AI Agent 的“语义检索底座”：文本先向量化入库，查询时把问题也向量化做近邻检索，再把结果喂给 LLM 生成回答。

## 下一步可延展

- 增加 metadata 过滤（如日期区间、mood、tags）
- 做 MySQL + Milvus 双写一致性策略
- 从“日记 demo”升级到“知识库/记忆系统/长文档检索”

