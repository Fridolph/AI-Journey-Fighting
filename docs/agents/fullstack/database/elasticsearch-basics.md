# Elasticsearch 基础

Elasticsearch（ES）是一个分布式搜索和分析引擎，基于 Apache Lucene。它不是一个数据库——**它是搜索引擎**。虽然 ES 可以存储数据，但它的核心能力是**全文搜索、实时分析和向量检索**。在 RAG（检索增强生成）架构中，ES 常被用作知识库的向量存储和语义搜索引擎。

## ES 在技术栈中的位置

```
┌─────────────────────────────────────────┐
│  RAG 架构                                │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐ │
│  │ 应用层  │→│ ES 检索  │→│ LLM 生成 │ │
│  │ 收集数据 │  │ 向量/全文│  │ 回答答案 │ │
│  └─────────┘  └──────────┘  └─────────┘ │
└─────────────────────────────────────────┘
```

ES 之于搜索，就像 MySQL 之于事务存储——各司其职，也可以组合使用。常见架构是"MySQL 做业务存储 + ES 做搜索索引"，数据从 MySQL 同步到 ES。

## 环境搭建

### 安装 Elasticsearch 和 Kibana

```bash
# macOS
brew tap elastic/tap
brew install elastic/tap/elasticsearch-full
brew services start elasticsearch-full

# Kibana（ES 的可视化控制台）
brew install elastic/tap/kibana-full
brew services start kibana-full
```

- ES 默认端口：**9200**（REST API）
- Kibana 默认端口：**5601**（Web 界面）
- 启动后访问 `localhost:9200` 看到 JSON 响应即为成功

### Kibana Dev Tools

Kibana 内置了 Dev Tools 控制台，是学习 ES 的最佳环境。打开 Kibana → 左侧菜单 → **Dev Tools**，就可以用 REST API 格式编写请求，自带自动补全和格式化。

本文所有示例都可以复制到 Kibana Dev Tools 中执行。

## 核心概念（与关系型数据库对照）

| 关系型 | Elasticsearch | 说明 |
|--------|--------------|------|
| Database | **Index**（索引） | 一组文档的逻辑容器 |
| Table | 没有直接的"表"概念 | Index 内通过不同的 `_type`（已废弃）或字段区分 |
| Row | **Document**（文档） | JSON 格式的一条数据 |
| Column | **Field**（字段） | 文档中的键 |
| Schema | **Mapping**（映射） | 定义字段类型和索引方式 |
| SQL | **Query DSL**（查询领域语言） | JSON 格式的查询语法 |
| SELECT * | `GET /index/_search` | 搜索接口 |

> ES 中的"索引"有两个含义：**名词**（Index = 一组文档的容器，类似 Database）和**动词**（Indexing = 存储文档的过程）。可以从上下文区分。

## 基础操作

为了方便演示，下面的示例使用一个书籍索引。打开 Kibana Dev Tools（`localhost:5601` → Dev Tools），复制粘贴运行。

### 创建索引与定义 Mapping

```json
PUT /books
{
  "mappings": {
    "properties": {
      "title":    { "type": "text", "analyzer": "ik_max_word" },
      "author":   { "type": "keyword" },
      "price":    { "type": "float" },
      "pages":    { "type": "integer" },
      "tags":     { "type": "keyword" },
      "summary":  { "type": "text", "analyzer": "ik_max_word" },
      "published": { "type": "date" }
    }
  }
}
```

字段类型说明：

| 类型 | 用途 | 说明 |
|------|------|------|
| `text` | 全文搜索字段 | 会被分词，支持模糊匹配 |
| `keyword` | 精确匹配字段 | 不分词，用于过滤、排序、聚合 |
| `integer` / `long` | 整数 | |
| `float` / `double` | 浮点 | |
| `boolean` | 布尔 | |
| `date` | 日期 | ISO 格式 |
| `object` | 嵌套 JSON | |
| `nested` | 独立索引的数组对象 | |
| `dense_vector` | 向量字段 | RAG/语义搜索必需 |

### CRUD 操作

```json
// ============ 插入文档 ============
POST /books/_doc
{
  "title": "深入浅出Elasticsearch",
  "author": "张三",
  "price": 59.9,
  "pages": 320,
  "tags": ["搜索", "大数据"],
  "summary": "从零开始学习Elasticsearch的安装、配置和实战应用",
  "published": "2025-01-01"
}

POST /books/_doc
{
  "title": "Python数据分析实战",
  "author": "李四",
  "price": 79.0,
  "pages": 450,
  "tags": ["Python", "数据分析"],
  "summary": "使用Pandas和Matplotlib进行数据分析和可视化",
  "published": "2024-06-15"
}

// 指定 ID 插入（PUT 会覆盖相同 ID 的文档）
PUT /books/_doc/1
{
  "title": "MySQL从入门到精通",
  "author": "王五",
  "price": 89.0,
  "pages": 600,
  "tags": ["数据库", "MySQL"],
  "summary": "全面讲解MySQL的安装、SQL语法、索引优化和性能调优",
  "published": "2025-03-01"
}

// ============ 查询文档 ============
GET /books/_doc/1                    // 按 ID 查
GET /books/_search                   // 查全部（默认返回 10 条）

// ============ 更新文档 ============
POST /books/_update/1
{
  "doc": { "price": 79.0 }
}

// ============ 删除文档 ============
DELETE /books/_doc/1

// ============ 删除索引 ============
DELETE /books
```

### 查看索引信息

```json
GET /_cat/indices?v           // 列出所有索引
GET /books/_mapping           // 查看 mapping
GET /books/_count             // 文档数量
```

## 全文搜索

### match 查询（核心）

```json
GET /books/_search
{
  "query": {
    "match": {
      "summary": "Elasticsearch 实战"
    }
  }
}
```

`match` 查询会将搜索词分词后匹配。上面的查询会把 "Elasticsearch 实战" 分词为 ["Elasticsearch", "实战"]，然后搜索包含这些词的文档。

### multi_match（多字段搜索）

```json
GET /books/_search
{
  "query": {
    "multi_match": {
      "query": "MySQL 数据库",
      "fields": ["title^2", "summary"]  // title 权重是 summary 的 2 倍
    }
  }
}
```

### 精确匹配（term）

```json
GET /books/_search
{
  "query": {
    "term": { "author": "张三" }    // keyword 类型不走分词，直接精确匹配
  }
}
```

### 复合查询（bool）

```json
GET /books/_search
{
  "query": {
    "bool": {
      "must": [                     // 必须满足（AND）
        { "match": { "summary": "搜索" } }
      ],
      "filter": [                   // 过滤（不影响评分，性能更好）
        { "term": { "tags": "搜索" } },
        { "range": { "price": { "gte": 50, "lte": 100 } } }
      ],
      "must_not": [                 // 必须不满足（NOT）
        { "term": { "tags": "过时" } }
      ],
      "should": [                   // 应该满足（OR，提升评分但不强制）
        { "match": { "title": "入门" } }
      ]
    }
  }
}
```

### 聚合（Aggregation）

ES 的聚合能力远强于传统数据库的 GROUP BY，可以实时对海量数据做统计分析：

```json
GET /books/_search
{
  "size": 0,                        // 不返回文档，只要聚合结果
  "aggs": {
    "avg_price": { "avg": { "field": "price" } },       // 平均价格
    "by_author": {
      "terms": { "field": "author" },                   // 按作者分组
      "aggs": {
        "avg_pages": { "avg": { "field": "pages" } }    // 每组平均页数
      }
    },
    "price_range": {
      "range": {
        "field": "price",
        "ranges": [
          { "to": 50 },
          { "from": 50, "to": 100 },
          { "from": 100 }
        ]
      }
    }
  }
}
```

## 批量操作

```json
// _bulk API：一次请求执行多个操作
POST /_bulk
{ "index": { "_index": "books", "_id": "1" } }
{ "title": "书A", "author": "作者A", "price": 50 }
{ "index": { "_index": "books", "_id": "2" } }
{ "title": "书B", "author": "作者B", "price": 80 }
{ "update": { "_index": "books", "_id": "1" } }
{ "doc": { "price": 45 } }
{ "delete": { "_index": "books", "_id": "2" } }
```

## 学习小结

- [x] 理解了 ES 的定位：**搜索引擎**，不是数据库
- [x] 掌握了核心概念对照：Index/Mapping/Document vs Database/Schema/Row
- [x] 搭建了环境，熟悉了 **Kibana Dev Tools**
- [x] 熟练了 CRUD 操作和 Mapping 定义
- [x] 掌握了 `match`/`multi_match`/`term`/`bool` 查询
- [x] 理解了 `filter`（不影响评分）和 `must`（影响评分）的区别
- [x] 学会了聚合（avg / terms / range）
- [x] 明确了 ES 在 RAG 架构中的位置
