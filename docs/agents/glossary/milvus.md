# Milvus（向量数据库）

## 一句话

**专门存向量、搜向量的数据库。** 传统数据库查「值等于什么」，Milvus 查「哪个向量和这个最接近」。

## 核心直觉

```
MySQL:  SELECT * FROM docs WHERE title = 'LangGraph教程'
Milvus: 搜「LangGraph 入门」→ 返回最相似的 top 10 文档（不管 title 叫什么）
```

MySQL 做的是「精确匹配」或「LIKE 模糊匹配」，Milvus 做的是**语义相似度搜索**——这是完全不同的查询范式。

## 为什么需要它（不能直接用 PostgreSQL 向量扩展吗？）

PostgreSQL 的 `pgvector` 插件也支持向量检索，但到了百万级向量就吃力了。Milvus 是**为向量检索而生**的专用数据库——分布式架构、多种 ANN 索引（HNSW/IVF/DiskANN）、支持混合检索（标量过滤 + 向量搜索）。

## 在 RAG 中的角色

```
文档 ─→ Embedding 模型 ─→ 向量 ─→ 存入 Milvus
问题 ─→ Embedding 模型 ─→ 向量 ─→ Milvus.search() ─→ top K 文档
```

## 优缺点

**优点：** 向量检索性能极致（百万级毫秒响应），分布式天然支持，多种索引算法可选
**缺点：** 部署复杂（需要 etcd + MinIO），小数据量用 PostgreSQL `pgvector` 更简单，学习成本高于 SQL

## 如何选择

```text
数据量 ─→
  < 10 万条：pgvector 够了，不需要 Milvus
  10-100 万条：都可以，看运维能力
  > 100 万条：Milvus，没得选
```

## 小结

Milvus 是 RAG 的存储基座——向量存在哪、怎么搜、搜多快，全看它。学习时用 pgvector 入门很合理，但生产级 RAG 最终都会走向专用向量数据库。

## 下一步

- [Embedding](./embedding.md) — Milvus 存的是 Embedding 向量
- [HNSW](./hnsw.md) — Milvus 底层的高效检索算法
