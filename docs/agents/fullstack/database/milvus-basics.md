# Milvus 基础

Milvus 是一个开源的**向量数据库**，专为 AI 应用设计。它不是存数据的，是**存向量**的——存的是文本、图片、音视频经过 Embedding 模型转换后的数学表示。

## 为什么需要向量数据库

传统数据库（MySQL、PostgreSQL）靠**精确匹配**搜数据——搜"跑步"就只能命中包含"跑步"字样的行。向量数据库靠**语义相似度**——搜"想运动一下"也能命中"今天早上跑步"。

| 场景 | MySQL | Milvus |
|------|-------|--------|
| 搜 "errorCode=5001" | ✅ 精确命中 | ❌ 可能漂到 5002 |
| 搜 "今天心情不好" | ❌ 需要包含"心情"关键字 | ✅ 语义匹配"失眠""烦躁"等记录 |
| 搜 CPU 型号 "i7-13700K" | ✅ 精确 | ❌ 可能匹配到 i7-12700K |

**核心结论**：Milvus 和 MySQL 不是替代关系，是互补关系。真实 AI Agent 项目通常两者都要。

## 核心心智模型：三级结构

```
database
  └── collection（类似 MySQL 的表）
        └── entity（类似 MySQL 的行）
```

每个 entity 包含两类字段：
- **标量字段**：id、文本内容、时间、标签等（和普通数据库一样）
- **向量字段**：Embedding 模型输出的浮点数数组（如 1024 维向量）

## 核心流程：四步走

```
原始文本 → ① Embedding（向量化） → ② 写入 Collection（带向量）
用户问题 → ③ Embedding（向量化） → ④ Search（近邻检索）
                                            │
                                            ▼
                                     最相似的 Top K 条
```

### ① Embedding（向量化）

文本不能直接存入 Milvus——需要先通过 Embedding 模型转成向量：

```js
import { OpenAIEmbeddings } from "@langchain/openai";

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: "text-embedding-v3"       // 或 qwen、其他模型
});

const vector = await embeddings.embedQuery("今天早上跑步");
// → [0.012, -0.034, 0.056, ...] 共 1024 个浮点数
```

> **向量维度必须一致**。定义 Collection 时设了 dim=1024，所有 Embedding 模型输出的维度也必须=1024。维度不一致会导致写入失败。

### ② 创建 Collection 并写入

定义 Schema（类似 MySQL 建表），指定字段名、类型、向量维度：

```js
import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node';

const client = new MilvusClient({ address: 'localhost:19530' });

// 创建 Collection
await client.createCollection({
  collection_name: 'ai_diary',
  fields: [
    { name: 'id',      data_type: DataType.VarChar, max_length: 50, is_primary_key: true },
    { name: 'vector',  data_type: DataType.FloatVector, dim: 1024 },
    { name: 'content', data_type: DataType.VarChar, max_length: 5000 },
    { name: 'date',    data_type: DataType.VarChar, max_length: 50 },
    { name: 'mood',    data_type: DataType.VarChar, max_length: 50 },
    { name: 'tags',    data_type: DataType.Array, element_type: DataType.VarChar,
      max_capacity: 10, max_length: 50 }
  ]
});

// 建索引（向量检索必需）
await client.createIndex({
  collection_name: 'ai_diary',
  field_name: 'vector',
  index_type: IndexType.IVF_FLAT,
  metric_type: MetricType.COSINE,    // 余弦相似度
  params: { nlist: 1024 }
});

// 加载到内存才能搜
await client.loadCollection({ collection_name: 'ai_diary' });
```

写入数据（文本需先向量化）：

```js
await client.insert({
  collection_name: 'ai_diary',
  data: [{
    id: '001',
    vector: await getEmbedding("今天早上在西湖边跑步，风景很好"),
    content: "今天早上在西湖边跑步，风景很好",
    date: "2025-06-01",
    mood: "开心",
    tags: ["运动", "户外"]
  }]
});
```

### ③ 语义搜索

查询时，把用户的问题也向量化，然后在 Milvus 里做近邻搜索：

```js
const queryVector = await getEmbedding("想出去运动一下");

const results = await client.search({
  collection_name: 'ai_diary',
  vector: queryVector,
  limit: 5,                          // 返回 Top 5
  output_fields: ['content', 'date', 'mood']
});
```

返回的结果按相似度（distance/score）降序排列，最相关的排最前面。

### ④ RAG 完整链路

Milvus 检索 → 拼装 Prompt → LLM 生成：

```js
// 1. 检索
const docs = await searchMilvus(query);    // Top K 相关文档

// 2. 拼装
const context = docs.map(d => d.content).join('\n');
const prompt = `基于以下信息回答：\n${context}\n问题：${query}`;

// 3. 生成
const answer = await llm.invoke(prompt);
```

完整实现见 `examples/milvus-test/src/rag.mjs`。

## 基础操作速查

| 操作 | API | 说明 |
|------|-----|------|
| 创建 Collection | `createCollection` | 定义字段 Schema，含向量字段 |
| 插入 | `insert` | 文本先 Embedding 再写入 |
| 查询（向量） | `search` | 查向量相似度，返回 Top K |
| 查询（标量） | `query` | 按条件过滤（如 date 范围） |
| 更新 | `upsert` | 按 ID 覆盖（文本变了需重算向量） |
| 删除 | `delete` | 按 ID 或条件批量删 |
| 加载 | `loadCollection` | 加载到内存才能搜索 |
| 释放 | `releaseCollection` | 释放内存 |

> 更新内容时必须**重新 Embedding**，否则会出现「内容和向量不匹配」的问题。

## Milvus vs Elasticsearch

两者都可用于 RAG，但在同一个项目中它们**互补而非替代**：

| 维度 | Milvus | ES |
|------|--------|----|
| 核心能力 | **纯向量检索**，快（毫秒级十亿级） | **词条检索 + 向量检索**，全能 |
| 匹配逻辑 | 语义相似度（意思像就行） | 词条匹配（字面差不多才行） |
| 中文支持 | 需要配合 Embedding 模型 | 自带 IK 分词器 |
| 安装运维 | Docker Compose 即可 | 较复杂 |
| 适用 | 知识库、记忆系统、语义搜索 | 全文搜索 + 混合检索 |

**最佳实践**：ES + Milvus 双通道——ES 做词条匹配处理术语/编号，Milvus 做语义检索处理自然语言问句，两路合并后 Rerank。

## 安装与运行

```bash
# Docker Compose 一键启动（含 Milvus + etcd + minio）
docker compose -f milvus-standalone-docker-compose.yml up -d

# Milvus 默认端口
# 19530 → gRPC 端口（SDK 连接）
# 9091  → HTTP 端口（REST API 管理）
```

## 学习小结

- [x] 理解了向量数据库和传统数据库的本质区别（语义 vs 精确）
- [x] 掌握了 Milvus 的四步核心流程：Embedding → Collection → Index → Search
- [x] 熟悉了 Collection Schema 定义和字段类型
- [x] 学会了基本的增删改查操作
- [x] 跑通了 Milvus → RAG 的最小闭环
- [x] 理清了 Milvus 和 ES 的互补定位
- [x] 理解了向量维度一致性的重要性

---

> 下一步可学习：Metadata 过滤（日期区间、标签筛选）、MySQL + Milvus 双写一致性策略、从 Demo 升级到知识库/记忆系统。
