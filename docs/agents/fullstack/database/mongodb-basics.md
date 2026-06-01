# MongoDB 基础

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
