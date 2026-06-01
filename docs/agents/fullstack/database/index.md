# 数据库

数据库是后端开发的基石。本文档集合覆盖了从关系型、文档型、内存型到搜索引擎和前端存储的完整技术栈。

## 文档导航

| 分类 | 文档 | 说明 |
|------|------|------|
| **关系型** | [MySQL 基础](./mysql-basics) | 环境搭建、Workbench、表设计、CRUD、用户权限、批量数据 |
| | [MySQL 进阶](./mysql-advanced) | 字段设计、索引优化、聚合/JOIN、事务锁、慢查询 |
| | [PostgreSQL 基础](./postgresql-basics) | psql/pgAdmin、schema 架构、特有类型、RETURNING 语法 |
| | [PostgreSQL 进阶](./postgresql-advanced) | JSONB、高级索引、窗口函数、MVCC、PL/pgSQL、全文搜索 |
| | [SQLite 基础](./sqlite-basics) | 嵌入式数据库、DB Browser、类型亲和性、对比与选型 |
| **文档型** | [MongoDB 基础](./mongodb-basics) | 非关系型概念、Compass、CRUD、聚合管道 |
| | [MongoDB 进阶](./mongodb-advanced) | 聚合管道、索引 ESR 规则、Schema 设计、事务、并发 |
| **内存型** | [Redis 基础](./redis-basics) | 五大数据类型、Pipeline、旁路缓存模式 |
| | [Redis 进阶](./redis-advanced) | Pub/Sub、Stream、持久化、分布式锁、Lua 脚本 |
| **搜索引擎** | [Elasticsearch 基础](./elasticsearch-basics) | Kibana、全文搜索、Mapping、聚合 |
| | [Elasticsearch 进阶](./elasticsearch-advanced) | IK 分词、向量搜索、RAG 集成、相关性调优 |
| **浏览器端** | [IndexedDB](./indexeddb) | Dexie.js、浏览器存储全景、离线应用模式 |

## 全景对比

### 一句话定位

| 数据库 | 一句话定位 |
|--------|-----------|
| **MySQL** | 最成熟的开源关系型数据库，Web 应用首选 |
| **PostgreSQL** | 最先进的开源关系型数据库，复杂查询和数据分析之王 |
| **SQLite** | 嵌入式数据库，本地工具和移动端首选 |
| **MongoDB** | 文档型 NoSQL，灵活 Schema + 水平扩展 |
| **Redis** | 内存数据结构服务器，缓存和实时场景标配 |
| **Elasticsearch** | 分布式搜索引擎，全文搜索和向量检索专用 |
| **IndexedDB** | 浏览器端异步事务数据库，离线 Web 应用基石 |

### 多维对比

| 维度 | MySQL | PostgreSQL | SQLite | MongoDB | Redis | Elasticsearch |
|------|-------|------------|--------|---------|-------|---------------|
| **类型** | 关系型 | 关系型 | 嵌入式关系型 | 文档型 NoSQL | 内存键值 | 搜索引擎 |
| **数据模型** | 表+行 | 表+行 | 表+行 | 集合+文档 | 键值/数据结构 | 索引+文档 |
| **SQL 标准** | 中等 | **最高** | 中高 | 有自己的 QL | 自己的命令 | Query DSL |
| **事务** | ACID | ACID | ACID | 4.0+ ACID | 有限事务(Lua) | 无 |
| **索引** | B-Tree/Fulltext | **B-Tree/Hash/GiST/GIN/BRIN** | B-Tree | B-Tree/Text/Geo/TTL | 无(内存直接访问) | **倒排索引/向量** |
| **扩展** | 主从/分片 | 流复制/Patroni | 无 | 复制集/分片 | 主从/哨兵/集群 | 天然分布式 |
| **部署** | 需服务端 | 需服务端 | **零配置** | 需服务端 | 需服务端 | 需服务端 |
| **学习曲线** | 中 | 中高 | 低 | 中 | 低入门高精通 | 中高 |
| **典型 QPS** | 1k~100k | 1k~100k | 1~1k（单机） | 1k~100k | **100k~1M** | 1k~100k |

### 技术选型决策树

```
需要做什么？
│
├─ 需要可靠的事务存储（订单、财务、用户）
│  ├─ 数据量大且查询复杂 → PostgreSQL
│  └─ 常规 Web、团队熟悉 → MySQL
│
├─ 本地工具、移动端、嵌入式
│  └─ SQLite
│
├─ 需要灵活 Schema、快速迭代、JSON 数据
│  └─ MongoDB
│
├─ 需要缓存、会话、排行榜、实时计数器
│  └─ Redis
│
├─ 需要全文搜索、日志分析、RAG 语义检索
│  └─ Elasticsearch
│
├─ 浏览器端离线存储、PWA
│  └─ IndexedDB
│
└─ 需要多个？
   └─ 组合使用（这是常态！）
      例：MySQL(业务) + Redis(缓存) + ES(搜索) + MongoDB(日志)
```

### 经典组合

| 场景 | 组合方案 |
|------|---------|
| 中小型 Web 应用 | MySQL + Redis |
| 内容/社区/实时应用 | PostgreSQL + Redis + MongoDB（日志/行为数据） |
| AI/RAG 知识库 | PostgreSQL（结构化数据）+ Elasticsearch（向量检索）+ Redis（缓存） |
| 离线桌面应用 | SQLite（本地存储） |
| 离线 Web/PWA | IndexedDB + Cache API |
| 实时分析/监控 | Elasticsearch + Redis |
| 高并发社交/物联网 | MongoDB（水平分片）+ Redis（缓存/队列） |

## 学习建议

1. **先学透一个关系型**：MySQL 或 PostgreSQL 拿一个做到熟练 CRUD + 索引 + 事务
2. **再加 Redis**：缓存是后端面试的必考项，也是性能优化的核心手段
3. **按需扩展**：遇到灵活性需求学 MongoDB，遇到搜索需求学 ES，做离线应用学 IndexedDB
4. **别同时学三四个**：数据库之间概念会串，先深入一个，再横向扩展

> 数据库是后端工程师最重要的硬技能之一。不是"会用 SQL 就行"——理解索引原理、事务隔离、并发控制，才能写出高性能、高可靠的系统。
