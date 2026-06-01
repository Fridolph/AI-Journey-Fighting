# MongoDB 进阶

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
