# Redis 基础

Redis 是一个内存键值存储数据库。与传统关系型数据库不同，它**所有数据都在内存中**，因此读写速度极快（微秒级）。它不是用来替代 MySQL 的——而是作为**缓存、会话存储、消息队列和实时计数器**，与持久化的关系型数据库协同工作。

> Redis 的核心价值：**快**。快到你可以用它做频率限制、排行榜、分布式锁，而不用担心性能瓶颈。

## 环境搭建

```bash
# macOS
brew install redis
brew services start redis

# 验证
redis-cli ping    # 返回 PONG 表示运行正常
```

- 默认端口：**6379**
- 命令行：`redis-cli`
- GUI 工具：**[RedisInsight](https://redis.com/redis-enterprise/redis-insight/)**（官方免费，推荐）

## 为什么 Redis 这么快？

| 原因 | 说明 |
|------|------|
| 纯内存操作 | 数据存在 RAM 中，无磁盘 I/O |
| 单线程模型 | 无锁竞争、无上下文切换开销（6.0+ 网络 I/O 多线程，命令执行仍单线程） |
| IO 多路复用 | 一个线程处理大量并发连接 |
| 简单数据结构 | 高度优化的数据结构实现 |

## 五大数据类型

### String（字符串）——最基础

```bash
SET user:1:name "张三"
GET user:1:name                     # "张三"

SET counter 0
INCR counter                        # 1（原子递增，并发安全）
INCRBY counter 10                   # 11

SETEX session:token 3600 "user_1"   # 带过期时间（秒）
TTL session:token                   # 查看剩余时间
```

String 可以存字符串、整数、浮点数，也可以存序列化的 JSON（不要存太大的值，Redis 单个 key 建议不超过 10KB）。

### Hash（哈希）——存对象

```bash
HSET user:1 name "张三" email "zhangsan@example.com" age 25
HGET user:1 name                    # "张三"
HGETALL user:1                      # 所有字段
HINCRBY user:1 age 1                # 原子递增
```

> Hash 适合存储对象属性。与 `JSON.stringify` 存 String 的区别：Hash 可以单独读写某个字段，不用整体序列化。

### List（列表）——队列/栈

```bash
LPUSH tasks "任务1" "任务2"         # 左侧插入
RPUSH tasks "任务3"                 # 右侧插入
LPOP tasks                          # 左侧弹出（队列：FIFO）
RPOP tasks                          # 右侧弹出（栈：LIFO）
LRANGE tasks 0 -1                   # 查看全部
```

List 底层是双向链表，在头尾插入弹出都是 O(1)。适合做消息队列、最新消息列表。

### Set（集合）——去重、交并差

```bash
SADD tags:1 "redis" "database" "cache"
SADD tags:2 "redis" "python"
SISMEMBER tags:1 "redis"            # 是否存在
SINTER tags:1 tags:2                # 交集：["redis"]
SUNION tags:1 tags:2                # 并集
SDIFF tags:1 tags:2                 # 差集：tags:1 有但 tags:2 没有
```

适合：标签、共同好友、去重计数。

### Sorted Set（有序集合）——排行榜

```bash
ZADD leaderboard 100 "张三" 85 "李四" 92 "王五"
ZRANGE leaderboard 0 -1 REV WITHSCORES  # 按分数降序
ZRANK leaderboard "张三"                # 排名（升序索引）
ZINCRBY leaderboard 10 "张三"           # 加分
```

Sorted Set 是 Redis 最强大的数据结构之一——既能按分数排序，又能快速查排名。适合：排行榜、延迟队列、带权重的标签。

## 通用操作

```bash
KEYS user:*               # 查找匹配的 key（生产环境禁用，用 SCAN）
SCAN 0 MATCH user:*       # 安全遍历 key
EXISTS user:1:name        # 是否存在
DEL user:1:name           # 删除
TYPE user:1               # 查看类型
EXPIRE key 3600           # 设置过期时间（秒）
PERSIST key               # 取消过期
```

## 批量操作（Pipeline）

```bash
# 在 redis-cli 中
redis-cli --pipe < commands.txt
```

用代码演示更直观：

```js
import { createClient } from 'redis';

const client = await createClient().connect();

// Pipeline：一次网络往返执行多条命令
const pipeline = client.multi();
for (let i = 1; i <= 1000; i++) {
  pipeline.set(`user:${i}:name`, `user_${i}`);
}
await pipeline.exec();    // 批量执行，比逐条执行快 10~50 倍

await client.quit();
```

## 缓存实战

### 缓存模式：旁路缓存

```
         ┌─────────┐
请求 ──→ │  应用层  │
         └────┬────┘
              │ 1. 先查 Redis
         ┌────▼────┐  命中 → 直接返回
         │  Redis  │
         └────┬────┘  未命中
              │ 2. 查 MySQL
         ┌────▼────┐
         │  MySQL  │
         └────┬────┘
              │ 3. 写回 Redis（设置过期时间）
         ┌────▼────┐
         │  Redis  │
         └─────────┘
```

```js
async function getUser(id) {
  // 1. 查缓存
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  // 2. 缓存未命中，查数据库
  const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return null;

  // 3. 写入缓存（过期时间随机化，防止缓存雪崩）
  const ttl = 3600 + Math.floor(Math.random() * 600);  // 3600~4200 秒
  await redis.setEx(`user:${id}`, ttl, JSON.stringify(user));

  return user;
}
```

### 缓存常见问题速查

| 问题 | 原因 | 方案 |
|------|------|------|
| 缓存穿透 | 查询不存在的数据，每次穿透到 DB | 缓存空值（`null`，短 TTL）、布隆过滤器 |
| 缓存击穿 | 热点 key 过期，大量请求打到 DB | 互斥锁/分布式锁只让一个请求去查 DB |
| 缓存雪崩 | 大量 key 同时过期，DB 瞬间被打爆 | TTL 加随机值、多级缓存、限流 |

## 学习小结

- [x] 理解了 Redis 的定位：**内存缓存 + 数据结构服务器**
- [x] 掌握了五大基本类型：String / Hash / List / Set / Sorted Set
- [x] 熟悉了 Pipeline 批量操作的性能优势
- [x] 理解了旁路缓存模式和缓存穿透/击穿/雪崩的应对方案
- [x] 能使用 RedisInsight 可视化浏览和管理数据
