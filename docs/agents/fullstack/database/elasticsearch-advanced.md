# Elasticsearch 进阶

从基础搜索到生产可用的 ES 能力。重点覆盖中文分词、相关性调优、聚合分析、向量搜索和 RAG 集成——这些是 ES 在 AI 应用中真正的杀手锏。

## 中文分词

ES 默认的分词器对中文无效（会把每个汉字当成一个词）。必须安装中文分词插件。

### 安装 IK 分词器

```bash
# macOS Homebrew 安装的 ES
cd /usr/local/var/elasticsearch
bin/elasticsearch-plugin install https://get.infini.cloud/elasticsearch/analysis-ik/8.15.1

# 或 Docker
RUN elasticsearch-plugin install https://get.infini.cloud/elasticsearch/analysis-ik/8.15.1
```

### IK 两种模式

```json
PUT /test_ik
{
  "mappings": {
    "properties": {
      "content": {
        "type": "text",
        "analyzer": "ik_max_word",      // 索引时：最大粒度分词
        "search_analyzer": "ik_smart"    // 搜索时：智能分词
      }
    }
  }
}
```

| 模式 | 输入："深入浅出Elasticsearch" | 用途 |
|------|-----|------|
| `ik_max_word` | ["深入浅出", "深入", "浅出", "elasticsearch"] | 索引时用，提高召回率 |
| `ik_smart` | ["深入浅出", "elasticsearch"] | 搜索时用，提高精确率 |

> **索引用 `ik_max_word`（尽量多分词），搜索用 `ik_smart`（减少噪音）**。这是 ES 中文搜索最实用的优化技巧。

### 测试分词效果

```json
GET /_analyze
{
  "analyzer": "ik_max_word",
  "text": "从零开始学习Elasticsearch的安装配置和实战应用"
}
```

## 相关性调优

ES 的搜索结果默认按 `_score`（相关性评分）降序排列。理解评分机制，才能让用户搜到最想要的内容。

### 提升字段权重

```json
GET /books/_search
{
  "query": {
    "multi_match": {
      "query": "MySQL 数据库",
      "fields": ["title^3", "summary^2", "tags"]  // title 权重最高
    }
  }
}
```

### function_score：自定义评分

```json
GET /books/_search
{
  "query": {
    "function_score": {
      "query": { "match": { "title": "MySQL" } },
      "functions": [
        { "field_value_factor": { "field": "sales", "factor": 0.1, "modifier": "log1p" } },
        { "gauss": { "published": { "origin": "2025-01-01", "scale": "365d", "decay": 0.5 } } }
      ],
      "boost_mode": "multiply"
    }
  }
}
```

这个查询不仅匹配标题，还将**销量**和**发布时间**纳入评分——越畅销、越新的书得分越高。

## 聚合进阶

### 日期直方图

```json
GET /books/_search
{
  "size": 0,
  "aggs": {
    "books_over_time": {
      "date_histogram": {
        "field": "published",
        "fixed_interval": "1M"    // 按月聚合
      },
      "aggs": {
        "avg_price": { "avg": { "field": "price" } }
      }
    }
  }
}
```

### 嵌套聚合（terms + top_hits）

```json
GET /books/_search
{
  "size": 0,
  "aggs": {
    "top_tags": {
      "terms": { "field": "tags", "size": 10 },
      "aggs": {
        "top_books": {
          "top_hits": { "size": 3, "_source": ["title", "price"] }
        }
      }
    }
  }
}
```

这个聚合一步完成：找出最热门的 10 个标签，每个标签下列出前三本书。

## 向量搜索与 RAG

Elasticsearch 8.0+ 原生支持 `dense_vector` 和 kNN 搜索——这意味着 ES 可以直接作为 RAG 架构中的向量数据库。

### 创建向量索引

```json
PUT /rag_docs
{
  "mappings": {
    "properties": {
      "content":    { "type": "text" },
      "embedding":  { "type": "dense_vector", "dims": 768, "index": true, "similarity": "cosine" }
    }
  }
}
```

### 通过 Node.js 写入向量

```js
import { Client } from '@elastic/elasticsearch';
const es = new Client({ node: 'http://localhost:9200' });

// 假设你用 OpenAI/本地模型拿到了 embedding
const embedding = await getEmbedding('Elasticsearch 支持向量搜索');

await es.index({
  index: 'rag_docs',
  document: {
    content: 'Elasticsearch 8.0+ 原生支持 dense_vector 和 kNN 搜索...',
    embedding: embedding
  }
});
```

### kNN 语义搜索

```json
GET /rag_docs/_search
{
  "knn": {
    "field": "embedding",
    "query_vector": [0.12, -0.34, 0.56, ...],  // 768 维向量
    "k": 5,
    "num_candidates": 100
  }
}
```

### RAG 架构中的 ES 定位

```
用户问题
    │
    ▼
┌──────────────┐
│ 1. Embedding │ ← OpenAI / 本地模型生成问题向量
└──────┬───────┘
       │ 向量
       ▼
┌──────────────┐
│ 2. ES kNN    │ ← 语义搜索最相关的文档片段
└──────┬───────┘
       │ top 5 文档
       ▼
┌──────────────┐
│ 3. Prompt拼装 │ ← 检索结果 + 用户问题 → 完整 Prompt
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 4. LLM 生成   │ ← 基于检索的知识生成回答
└──────────────┘
```

## 索引性能优化

### 批量写入

```js
// _bulk API 批量索引，比逐条写入快几十倍
const body = docs.flatMap(doc => [
  { index: { _index: 'books' } },
  doc
]);
await es.bulk({ body });
```

### 索引设置调优

```json
PUT /books/_settings
{
  "index": {
    "refresh_interval": "30s",       // 批量导入时延长刷新间隔
    "number_of_replicas": 0          // 导入完再开启副本
  }
}
```

### 查询优化

- `filter` 代替 `must`：filter 不计算评分，会缓存结果，比 must 快
- 使用 `size: 0`：只需要聚合结果时不要返回文档
- 限制 `from + size`：深度分页用 `search_after` 代替 `from/size`
- `_source` 过滤：只返回需要的字段

## 学习小结

- [x] 掌握了 IK 分词器的安装和 `ik_max_word`/`ik_smart` 双模式策略
- [x] 理解了 `multi_match` 权重提升和 `function_score` 自定义评分
- [x] 熟悉了日期直方图和嵌套聚合
- [x] 学会了 `dense_vector` + kNN 实现语义搜索
- [x] 理解了 ES 在 RAG 架构中的核心定位（向量存储 + 语义检索）
- [x] 掌握了批量写入和索引性能调优
