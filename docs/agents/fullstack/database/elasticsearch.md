# Elasticsearch


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

---

## 倒排索引（ES 的灵魂）

ES 之所以快，不是因为它读数据快，而是它**不读数据**——它查索引。

### 正向索引 vs 倒排索引

| | 正向索引（MySQL） | 倒排索引（ES） |
|--|-----------------|---------------|
| 方向 | 文档 → 关键词 | 关键词 → 文档 |
| 怎么搜 | 遍历每一行，扫描 content 字段 | 直接查关键词表，拿到文档 ID 列表 |
| 性能 | O(n)，数据量越大越慢 | O(1) 查词，再按 BM25 排序 |
| 类比 | 图书馆的书架：一本本翻书 | 卡片柜：拉开"跑"的抽屉直达结果 |

### 一个具体的对比

假设有三条数据：

```
| id | content          |
|----|------------------|
| 1  | 今天早上跑步      |
| 2  | 今天晚上跑步      |
| 3  | 今天早上骑车      |
```

**MySQL 搜"跑步"**：遍历 3 行，每行做 `LIKE '%跑步%'` 匹配，找到 id=1,2。3 行很快，3000 万行就慢了。

**ES 搜"跑步"**：倒排索引表长这样——

```
"今天" → [1, 2, 3]
"早上" → [1, 3]
"跑步" → [1, 2]
"骑车" → [3]
"晚上" → [2]
```

直接查"跑步" → [1, 2] → 一秒定位，不需要扫描任何不相关的数据。

> **理解了倒排索引，就理解了 ES 为什么快。**

---

## 为什么有了 Milvus 还要 ES

Milvus（向量数据库）做**语义匹配**——「意思差不多就行」。ES 做**词条匹配**——「字面对上了才算」。

这两种搜索解决的是完全不同维度的问题：

| | Milvus（语义检索） | ES（词条检索） |
|--|-------------------|----------------|
| 匹配逻辑 | 「意思差不多」 | 「字面差不多」 |
| 适合输入 | 自然语言问句、模糊概念 | 术语、编号、代码、人名、地名 |
| 典型成功 | 搜「杭州旅游」命中「西湖攻略」 | 搜 `errorCode=5001` 只会命中 5001 |
| 典型失败 | 搜 `i7-13700K` 可能漂到 `i7-12700K` | 搜「西湖攻略」搜不到「杭州旅游」 |

> ⚠️ ES 不是「精确搜索」（`=`），而是**词条/关键词检索**。它的 `match` 查询仍然是分词后匹配，只是匹配单位是**词**而不是语义向量。真正的精确匹配是 `term` 查询配合 `keyword` 类型字段。

**混合检索方案**：ES 做词条匹配 + Milvus 做语义检索 → 两路结果合并去重 → Rerank → LLM 作答。

---

## BM25 算法

BM25 是 ES 默认的打分排序算法，决定「召回了 100 篇文档，哪篇排第一」。

### BM25 vs TF-IDF

TF-IDF 是 BM25 的前身，核心缺陷：线性的。

```
TF-IDF 的问题：
  「的」出现 1000 次 = 1000 分，堆砌关键词就能刷排名
  10 万字书提 3 次"跑步" = 100 字笔记提 3 次 = 同样分数（不公平）

BM25 的改进：
  词频饱和：出现 10 次和 100 次分数差别不大，刷词没用
  长度归一化：长文档"扣分"，短文档"加分"，公平对比
  稀有词高权重：搜 1% 文档才出现的词 ≈ 非常关键
```

### BM25 三个参数

| 参数 | 控制什么 | 默认值 |
|------|---------|--------|
| `k1` | 词频饱和度 | 1.2 |
| `b` | 文档长度影响 | 0.75 |
| `boost` | 字段权重 | 1.0 |

不需要手动调。ES 默认使用 BM25，大多数场景直接生效。

### 一句话记住 BM25

> **一个词在一篇文档中反复出现很重要，但不是线性重要——出现 100 次不等于相关 100 倍；一个词在越少的文档中出现越重要，说明它很有区分度；长文档要扣分，因为讨论范围更广，特定词的相对重要性更低。**

---

## 检索全流程：IK 分词 → 倒排索引 → BM25 排序

```
① 建索引 → ik_max_word 分词 → 建立倒排索引表
   "杭州西湖半日游" → ["杭州", "西湖", "半日", "游", "杭州西湖", "半日游"]

② 搜索   → ik_smart 分词 → 查倒排索引 → 召回文档列表
   "西湖攻略" → ["西湖", "攻略"] → 命中倒排表 → 拿到候选文档

③ 排序   → BM25 对候选文档打分 → 返回 Top K
```

**这三个串起来，就是 ES 的核心搜索流水线。理解了它，就理解了 ES 的工作原理。**

---

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
- [x] **理解了倒排索引原理——ES 快的本质不是读得快，而是不读数据只查索引**
- [x] **理清了 ES（词条检索）和 Milvus（语义检索）的互补关系**
- [x] **掌握了 BM25 的核心思想：词频饱和 + 文档长度归一化 + 稀有词权重**
- [x] **看懂了 IK 分词 → 倒排索引 → BM25 排序的检索流水线**
- [x] 搭建了环境，熟悉了 **Kibana Dev Tools**
- [x] 熟练了 CRUD 操作和 Mapping 定义
- [x] 掌握了 `match`/`multi_match`/`term`/`bool` 查询
- [x] 理解了 `filter`（不影响评分）和 `must`（影响评分）的区别
- [x] 学会了聚合（avg / terms / range）
- [x] 明确了 ES 在 RAG 架构中的位置


---

# 进阶

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

### 混合检索架构（ES + Milvus 双通道）

纯 ES 向量搜索足够应对大部分 RAG 场景，但实践中有一个关键问题：**术语/编号/代码不适合向量搜索**。比如搜 `errorCode=5001`，向量检索容易漂到 `5002`。

更完善的架构是 ES + Milvus 双通道混合检索：

```
用户查询
    │
    ▼
LLM 重写（扩展为多角度问句）
    │
    ├──→ ES 关键词检索（ik_smart 分词）──→ hits_es
    │
    └──→ Milvus 语义检索 ──→ hits_milvus
              │
              ▼
         全量合并去重
              │
              ▼
          Rerank（重排序）
              │
              ▼
          LLM 作答
```

**ES 贡献**：精确术语、编号、代码等不适合向量化的查询，走词条匹配  
**Milvus 贡献**：自然语言问句、模糊概念的语义相似度检索  
**Rerank 解决**：两路检索取回的结果由 Rerank 模型做最终排序

完整实现见 `examples/es-test/src/rag/hybrid-retrieval.mjs`（LangGraph 编排）。

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
- [x] **理解了 ES + Milvus 混合检索架构：ES 做词条匹配、Milvus 做语义检索、Rerank 做最终排序**
- [x] 掌握了批量写入和索引性能调优

---

## 参考资源

- [Elasticsearch 官方文档](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- [Kibana 用户指南](https://www.elastic.co/guide/en/kibana/current/index.html)

