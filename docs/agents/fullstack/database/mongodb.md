# MongoDB


MongoDB 是一个文档型 NoSQL 数据库。与 MySQL/PostgreSQL 这类关系型数据库不同，它**不需要预定义表结构**，数据以灵活的 JSON 文档形式存储。对于需求频繁变动的项目、半结构化数据和快速原型开发，MongoDB 的体验远超传统关系型数据库。

## 关系型 vs 非关系型：概念速通

在学习 MongoDB 之前，先用一张表理清两种数据库范式的核心差异：

| 维度 | 关系型（MySQL/PG/SQLite） | 非关系型（MongoDB） |
|------|--------------------------|---------------------|
| 数据模型 | 表（Table）：行 + 列，结构固定 | 集合（Collection）：文档 + 字段，结构灵活 |
| Schema | 强制预定义（ALTER TABLE 改结构） | 动态隐式（每个文档可以有不同的字段） |
| 关系 | JOIN 连接多表 | 嵌套文档、引用（避免 JOIN） |
| 事务 | ACID，成熟稳定 | 4.0+ 支持多文档 ACID 事务 |
| 扩展方向 | 垂直扩展（升级硬件）为主 | 水平扩展（分片集群）为设计初衷 |
| SQL 语言 | 标准 SQL | MongoDB Query Language（类 JSON 语法） |
| 典型场景 | 财务系统、ERP、数据一致性要求高的业务 | 内容管理、实时分析、IoT、日志、社交信息流 |

> MongoDB 不是"更好的 MySQL"，也不是"不需要事务"。它是为**文档型、弹性 Schema、水平扩展**场景量身定做的工具。

### MongoDB 的核心设计哲学

```json
// 关系型：users 表 + orders 表，通过 JOIN 关联
// MongoDB：一个文档包含用户和其订单
{
  "_id": ObjectId("..."),
  "username": "张三",
  "email": "zhangsan@example.com",
  "orders": [
    { "order_no": "ORD001", "amount": 99.9, "items": ["书", "笔"] },
    { "order_no": "ORD002", "amount": 199.0, "items": ["耳机"] }
  ]
}
```

这种方式叫做**嵌入式文档**——把相关的数据放在同一个文档里，一次查询即可获取全部信息。避免了关系型数据库的 JOIN 开销（但也带来了数据冗余和更新复杂性的权衡）。

## 环境搭建

### 安装 MongoDB

```bash
# macOS
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0

# 验证连接
mongosh
```

- 默认端口：**27017**
- 命令行工具：`mongosh`（新版 Shell，取代了旧的 `mongo` 命令）

### MongoDB Compass

Compass 是 MongoDB 官方免费的 GUI 工具，类似 MySQL Workbench + 数据可视化合体：

- 下载：https://www.mongodb.com/products/compass
- 连接：打开后输入 `mongodb://localhost:27017`，点击 Connect

**核心功能：**

| 功能区 | 用途 |
|--------|------|
| Databases 面板 | 浏览数据库/集合，查看文档数量、索引、存储大小 |
| Documents 标签 | 查看/编辑/删除文档，支持 JSON 视图和表格视图 |
| Aggregations 标签 | 可视化构建聚合管道，实时预览每个阶段的结果 |
| Schema 标签 | 自动分析集合中的字段分布、数据类型和覆盖率 |
| Indexes 标签 | 查看/创建/删除索引 |
| Explain Plan 标签 | 分析查询性能，查看是否命中索引 |

> Compass 的 **Aggregations 管道构建器**是学习 MongoDB 聚合的最好工具——你可以逐阶段添加 `$match`、`$group`、`$sort` 等操作符，实时预览每个阶段的输出，比命令行直观得多。

## 核心概念对照

| 关系型概念 | MongoDB 概念 | 说明 |
|-----------|-------------|------|
| Database | Database | 两者相同 |
| Table | **Collection**（集合） | 一组文档的容器，类比表 |
| Row | **Document**（文档） | BSON 格式（二进制 JSON） |
| Column | **Field**（字段） | 文档中的键值对 |
| Primary Key | `_id`（自动生成 ObjectId） | 每文档必有，12 字节唯一标识 |
| JOIN | `$lookup` 聚合 / 嵌套文档 | MongoDB 更推荐嵌套而非 JOIN |
| Schema | 无强制 Schema（可选 Schema Validation） | 灵活但也需要约束 |

## 基础操作

### 数据库与集合

```js
// 显示所有数据库
show dbs

// 切换/创建数据库（插入第一条数据时才实际创建）
use mydb

// 查看当前数据库
db

// 创建集合（集合会在插入文档时自动创建，也可以显式创建）
db.createCollection('users')

// 查看所有集合
show collections

// 删除集合
db.users.drop()

// 删除数据库
db.dropDatabase()
```

### CRUD 操作

MongoDB 的查询语言使用类 JSON 语法，本质上是在写 JavaScript 对象：

```js
// ========== 插入（INSERT）==========
db.users.insertOne({
  username: '张三',
  email: 'zhangsan@example.com',
  age: 25,
  tags: ['developer', 'reader'],
  is_active: true,
  created_at: new Date()
})

// 批量插入
db.users.insertMany([
  { username: '李四', email: 'lisi@example.com', age: 30, tags: ['designer'] },
  { username: '王五', email: 'wangwu@example.com', age: 28, tags: ['manager'] }
])

// ========== 查询（SELECT）==========
db.users.find()                              // 查全部（默认返回 20 条）
db.users.find({ age: 25 })                   // 等值查询
db.users.find({ age: { $gt: 25 } })           // 大于（$gte 大于等于）
db.users.find({ age: { $gte: 20, $lte: 30 } }) // 范围查询
db.users.find({ tags: 'developer' })          // 数组包含
db.users.find({}, { username: 1, email: 1 })  // 投影（只返回指定字段）
db.users.find().sort({ age: -1 })             // 降序排序
db.users.find().limit(10).skip(20)            // 分页：第 21~30 条
db.users.findOne({ username: '张三' })        // 返回第一条匹配
db.users.countDocuments({ age: { $gt: 25 } }) // 计数

// 逻辑运算符
db.users.find({ $or: [{ age: 25 }, { age: 30 }] })       // OR
db.users.find({ $and: [{ age: { $gt: 20 } }, { tags: 'developer' }] }) // AND

// ========== 更新（UPDATE）==========
// 更新单条（$set 只更新指定字段，不覆盖整个文档）
db.users.updateOne(
  { username: '张三' },
  { $set: { age: 26, email: 'new@example.com' } }
)

// 更新多条
db.users.updateMany(
  { age: { $lt: 30 } },
  { $inc: { age: 1 } }     // $inc 递增
)

// 不存在则插入（upsert）
db.users.updateOne(
  { username: '赵六' },
  { $set: { email: 'zhaoliu@example.com', age: 22 } },
  { upsert: true }
)

// ========== 删除（DELETE）==========
db.users.deleteOne({ username: '李四' })
db.users.deleteMany({ age: { $lt: 18 } })
db.users.deleteMany({})   // 清空集合所有文档
```

### 常用查询操作符

| 操作符 | 含义 | 示例 |
|--------|------|------|
| `$eq / $ne` | 等于/不等于 | `{ age: { $ne: 25 } }` |
| `$gt / $gte` | 大于/大于等于 | `{ age: { $gte: 18 } }` |
| `$lt / $lte` | 小于/小于等于 | `{ age: { $lte: 60 } }` |
| `$in / $nin` | 在列表中/不在 | `{ tags: { $in: ['developer', 'designer'] } }` |
| `$exists` | 字段是否存在 | `{ phone: { $exists: true } }` |
| `$regex` | 正则匹配 | `{ username: { $regex: /张/ } }` |
| `$text` | 全文搜索 | `{ $text: { $search: 'developer' } }` |

## 批量操作

### 使用脚本批量写入

```js
// 在 mongosh 中直接运行
const bulk = [];
for (let i = 1; i <= 10000; i++) {
  bulk.push({
    username: `user_${i}`,
    email: `user_${i}@example.com`,
    age: 18 + Math.floor(Math.random() * 42),
    tags: ['auto_generated'],
    created_at: new Date()
  });
}
db.users.insertMany(bulk);
```

### Node.js 批量写入

```js
import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb://localhost:27017');
await client.connect();
const db = client.db('mydb');
const collection = db.collection('users');

// 使用 bulkWrite 进行高性能批量操作
const ops = [];
for (let i = 1; i <= 10000; i++) {
  ops.push({
    insertOne: {
      document: {
        username: `user_${i}`,
        email: `user_${i}@example.com`,
        age: 18 + Math.floor(Math.random() * 42),
        created_at: new Date()
      }
    }
  });
}
await collection.bulkWrite(ops, { ordered: false });  // ordered:false 错误不中断
await client.close();
```

## Compass 每日工作流

1. **连接**：打开 Compass → 填入连接串 `mongodb://localhost:27017` → Connect
2. **浏览**：左侧 Databases 面板 → 展开 mydb → 点击 users 集合
3. **查数据**：Documents 标签 → Filter 输入 `{ age: { $gt: 25 } }` → Find
4. **改数据**：双击文档 → 编辑 JSON → Update
5. **看 Schema**：Schema 标签 → 查看字段分布和覆盖率（发现异常数据的神器）
6. **调聚合**：Aggregations 标签 → 逐阶段添加 `$match` / `$group` / `$sort`

## 学习小结

- [x] 理解了关系型与非关系型的**核心差异**和各自的适用场景
- [x] 掌握了 MongoDB 的**核心概念**（数据库/集合/文档 vs 数据库/表/行）
- [x] 搭建了环境，会用 **mongosh 命令行**和 **Compass GUI**
- [x] 熟练了 **CRUD**（insertOne/insertMany / find/updateOne / deleteMany）
- [x] 掌握了**查询操作符**（$gt/$in/$regex/$exists）和**更新操作符**（$set/$inc）
- [x] 学会了通过 **bulkWrite** 和 **insertMany** 进行高性能批量写入


---

# 进阶

从基础 CRUD 到中级后端开发所需的 MongoDB 能力。重点覆盖聚合管道、索引策略、Schema 设计、事务与并发控制。

## 聚合管道

聚合管道是 MongoDB 最强大的分析工具——数据像流水线一样经过多个处理阶段（stage），每个阶段对数据进行过滤、分组、转换或计算。如果熟悉 Linux 的管道 `|`，这个理念完全一致。

### 管道阶段速览

```js
db.orders.aggregate([
  { $match: { status: 'completed' } },          // 1. 过滤
  { $group: { _id: '$user_id', total: { $sum: '$amount' } } }, // 2. 分组+求和
  { $sort: { total: -1 } },                     // 3. 排序
  { $limit: 10 }                                 // 4. 取前 10
])
```

### 常用阶段

| 阶段 | 作用 | 类比 SQL |
|------|------|---------|
| `$match` | 过滤文档 | `WHERE` |
| `$group` | 分组聚合 | `GROUP BY` + 聚合函数 |
| `$sort` | 排序 | `ORDER BY` |
| `$limit` / `$skip` | 限制/跳过 | `LIMIT / OFFSET` |
| `$project` | 字段选择+计算 | `SELECT` 特定列 |
| `$lookup` | 左外连接另一个集合 | `LEFT JOIN` |
| `$unwind` | 展开数组字段 | 展开嵌套数组 |
| `$addFields` | 添加计算字段 | 类似 SQL 的表达式 |
| `$bucket` | 按范围分组 | 自定义区间分组 |
| `$facet` | 多维度并行聚合 | 一个查询输出多个聚合结果 |

### 实战：订单分析

```js
db.orders.aggregate([
  // 只统计已完成订单
  { $match: { status: 'completed' } },

  // 按用户分组，计算每人总消费和订单数
  { $group: {
    _id: '$user_id',
    total_spent: { $sum: '$amount' },
    order_count: { $sum: 1 },
    avg_amount: { $avg: '$amount' },
    max_order: { $max: '$amount' }
  }},

  // 只保留消费超过 1000 的用户
  { $match: { total_spent: { $gte: 1000 } } },

  // 按总消费降序
  { $sort: { total_spent: -1 } },

  // 关联用户表获取用户名
  { $lookup: {
    from: 'users',
    localField: '_id',
    foreignField: '_id',
    as: 'user_info'
  }},

  // 只取前 20
  { $limit: 20 }
])
```

### `$lookup` 详解

```js
// 等于 SQL: SELECT * FROM orders LEFT JOIN users ON orders.user_id = users._id
db.orders.aggregate([
  { $lookup: {
    from: 'users',             // 关联的目标集合
    localField: 'user_id',     // orders 表中用于关联的字段
    foreignField: '_id',       // users 表中用于关联的字段
    as: 'user'                 // 输出到哪个字段（数组）
  }},
  // user 是数组，取第一个元素
  { $unwind: '$user' }
])
```

> 虽然 `$lookup` 可以实现 JOIN，但 MongoDB 的最佳实践是**尽可能用嵌套文档代替 JOIN**。把经常一起查询的数据嵌在一个文档里，一次查询即可获取。只有非强相关的数据才用 `$lookup`。

## 索引

### 索引类型

```js
// 单字段索引
db.users.createIndex({ email: 1 })

// 复合索引（注意字段顺序遵循 ESR 规则：等值 Equal → 排序 Sort → 范围 Range）
db.users.createIndex({ status: 1, created_at: -1 })

// 唯一索引
db.users.createIndex({ email: 1 }, { unique: true })

// 文本索引（支持全文搜索）
db.articles.createIndex({ title: 'text', content: 'text' })
db.articles.find({ $text: { $search: 'MongoDB 聚合' } })

// TTL 索引（到期自动删除，适合日志/验证码/临时数据）
db.sessions.createIndex({ created_at: 1 }, { expireAfterSeconds: 3600 })  // 1 小时后过期

// 地理空间索引（附近的人 / 附近的店）
db.places.createIndex({ location: '2dsphere' })
db.places.find({
  location: { $near: { $geometry: { type: 'Point', coordinates: [120.1, 30.2] }, $maxDistance: 5000 } }
})
```

### 查看与诊断

```js
// 列出所有索引
db.users.getIndexes()

// 分析查询性能（3 种模式）
db.users.find({ email: 'test@example.com' }).explain('executionStats')

// 关注字段：
// winningPlan.stage → 'IXSCAN'（索引扫描 ✅）、'COLLSCAN'（全表扫描 ❌）
// executionTimeMillis → 执行耗时
// totalDocsExamined vs nReturned → 扫描文档数 vs 返回数（比例越大越需优化）
```

### 索引设计原则

1. **ESR 规则**：复合索引字段顺序——**E**qual（等值查询）→ **S**ort（排序）→ **R**ange（范围查询）
2. **覆盖查询**（Covered Query）：返回字段全在索引中时，不读数据文件，性能翻倍
3. **避免过多索引**：每个索引在写入时都要更新，3-5 个索引是合理范围
4. **监控索引使用**：`db.users.aggregate([{ $indexStats: {} }])` 查看哪些索引从未被使用

```js
// ESR 示例：按 status 查询，按 created_at 降序
// ✅ 正确顺序（先等值后排序）
db.orders.createIndex({ status: 1, created_at: -1 })

// ❌ 错误顺序（排序在前无法充分利用索引）
db.orders.createIndex({ created_at: -1, status: 1 })
```

## Schema 设计模式

MongoDB 的 Schema 灵活是优势，但不是"不需要设计"。好的 Schema 设计直接影响性能和可维护性。

### 嵌套 vs 引用

```js
// 方案 A：嵌套（适合"一对一"和"强一体"关系）
{
  _id: 1,
  username: '张三',
  addresses: [
    { type: 'home', city: '杭州', detail: '西湖区...' },
    { type: 'work', city: '上海', detail: '浦东新区...' }
  ]
}
// 优点：一次查询拿到全部；缺点：地址更新需要更新整个用户文档

// 方案 B：引用（适合"一对多"且子数据量大、独立更新的场景）
// users 集合
{ _id: 1, username: '张三' }
// orders 集合
{ _id: 100, user_id: 1, amount: 99 }
// 优点：订单独立管理；缺点：需要两次查询或 $lookup
```

### 设计决策指南

| 关系类型 | 推荐方案 | 示例 |
|---------|---------|------|
| 一对一，强绑定 | **嵌套** | 用户 + 用户 Profile |
| 一对多，子项少且固定 | **嵌套** | 用户 + 收货地址（通常 2~5 个） |
| 一对多，子项多或持续增长 | **引用** | 用户 + 订单（可能成千上万） |
| 多对多 | **引用** + 中间集合 | 用户 + 角色 + 用户_角色关联表 |

> 嵌套的黄金规则：**把经常一起读的数据放在一起；把独立变化的数据分开。**

## 事务

MongoDB 4.0+ 支持多文档 ACID 事务。与关系型数据库不同，MongoDB 的事务主要用于需要跨集合原子操作的场景。

```js
// 在 mongosh 中使用事务
const session = db.getMongo().startSession();
session.startTransaction();

try {
  const users = session.getDatabase('mydb').getCollection('users');
  const orders = session.getDatabase('mydb').getCollection('orders');

  // 扣减余额
  users.updateOne({ _id: 1 }, { $inc: { balance: -100 } });

  // 创建订单
  orders.insertOne({ user_id: 1, amount: 100, status: 'paid' });

  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
} finally {
  session.endSession();
}
```

> MongoDB 事务的性能开销高于非事务操作。**不要把所有操作都包在事务里**——只有真正需要原子性的场景（如转账）才用事务。

## 并发与锁

### 锁的粒度

MongoDB 的锁粒度从粗到细分三个级别，现代版本（4.0+）默认使用最细粒度：

| 级别 | 说明 |
|------|------|
| Global | 全局锁（早期版本，已废弃） |
| Database | 数据库级锁 |
| **Collection** | 集合级锁（当前默认） |
| Document | 文档级锁（WiredTiger 引擎） |

WiredTiger 存储引擎使用**乐观并发控制**——写操作不阻塞读操作，只有在写冲突时才重试。这在高读写混合场景下表现优异。

### 并发写入策略

```js
// 乐观锁模式：通过版本号防止并发覆盖
const doc = db.users.findOne({ _id: 1 });
const result = db.users.updateOne(
  { _id: 1, version: doc.version },   // 条件包含旧版本号
  { $set: { balance: newBalance }, $inc: { version: 1 } }
);
if (result.matchedCount === 0) {
  // 版本号不匹配 = 被其他操作修改过，重试
}
```

## 复制集与分片（概念）

中级后端工程师需要了解这两个概念，但不一定要亲自搭建：

### 复制集（Replica Set）

- **作用**：高可用 + 数据冗余
- **结构**：一个 Primary（读写）+ 多个 Secondary（只读备份）
- Primary 宕机时 Secondary 自动选举为新 Primary

### 分片集群（Sharding）

- **作用**：水平扩展，突破单机存储和性能上限
- **原理**：数据按 shard key 分散到多个分片服务器
- **适用**：数据量达到 TB 级别时

## 学习小结

- [x] 掌握了**聚合管道**的核心阶段（$match/$group/$lookup/$sort）和实战订单分析
- [x] 理解了 **ESR 索引规则**和 `explain('executionStats')` 诊断方法
- [x] 熟悉了 TTL 索引、文本索引、地理空间索引的实战场景
- [x] 掌握了 **Schema 设计**：嵌套 vs 引用的决策指南
- [x] 理解了 MongoDB **事务**的使用场景和性能考量
- [x] 了解了并发控制（乐观锁）和锁粒度
- [x] 建立了复制集和分片的**概念认知**

---

## 参考资源

- [MongoDB 官方文档](https://www.mongodb.com/docs/)
- [MongoDB Compass](https://www.mongodb.com/products/compass)

