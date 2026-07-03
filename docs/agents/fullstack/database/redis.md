# Redis


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


---

# 进阶

从缓存读写到中级后端开发所需的 Redis 能力。覆盖高级数据结构、发布订阅、持久化、集群概念和分布式锁。

## 发布订阅（Pub/Sub）

Pub/Sub 是 Redis 内置的轻量级消息系统——生产者发消息，所有订阅该频道的消费者同时收到：

```bash
# 终端 A：订阅
SUBSCRIBE notifications

# 终端 B：发布
PUBLISH notifications "新订单: ORD001"
PUBLISH notifications "用户注册: user_123"

# 终端 A 会实时收到两条消息
```

> Pub/Sub 的消息是**即发即忘**的——没有消息持久化，订阅者不在线时消息丢失。如果需要可靠的消息队列，用 Redis Stream（见下文）或 RabbitMQ/Kafka。

## 高级数据结构

### Bitmaps（位图）——签到、活跃用户统计

```bash
SETBIT user:login:20260101 1001 1    # 用户 1001 签到
SETBIT user:login:20260101 1002 1    # 用户 1002 签到
BITCOUNT user:login:20260101         # 2026-01-01 签到总人数
GETBIT user:login:20260101 1001      # 用户 1001 是否签到
```

### HyperLogLog——UV 去重统计（误差约 0.81%）

```bash
PFADD page:uv:20260101 "user1" "user2" "user3"
PFADD page:uv:20260101 "user1" "user4"            # user1 重复，不计入
PFCOUNT page:uv:20260101                           # 4（实际 4 个不同用户）
```

无论数据量多大，HyperLogLog 每个 key 只占 **12KB** 内存。适合亿级 UV 统计。

### Geospatial——附近的人、附近的店

```bash
GEOADD shops 120.15 30.28 "星巴克杭州西湖店"
GEOADD shops 120.16 30.27 "喜茶杭州湖滨店"
GEORADIUS shops 120.15 30.28 1 km WITHDIST     # 1 公里内的店
GEODIST shops "星巴克杭州西湖店" "喜茶杭州湖滨店" km  # 两店距离
```

### Stream——可靠消息队列（5.0+）

```bash
XADD orders * action "create" user_id 1 amount 99  # * = 自动生成 ID
XADD orders * action "pay" user_id 1 amount 99
XLEN orders                                       # 队列长度
XREAD COUNT 2 STREAMS orders 0                    # 从头读 2 条
XREAD BLOCK 5000 STREAMS orders $                 # 阻塞等待新消息
```

Stream 解决了 Pub/Sub 消息丢失的问题——消息持久化，支持消费者组，可以重放。

## 持久化：RDB vs AOF

Redis 虽然是内存数据库，但支持两种持久化方式保数据不丢：

| 方式 | RDB（快照） | AOF（追加日志） |
|------|-----------|---------------|
| 机制 | 定期保存内存快照到 `.rdb` 文件 | 每条写命令追加到 `.aof` 文件 |
| 优点 | 文件小、恢复快 | 数据安全（最多丢 1 秒） |
| 缺点 | 可能丢失最后一次快照后的数据 | 文件大、恢复慢 |
| 适用 | 备份、灾备 | 对数据安全要求高 |

```bash
# 生产环境推荐：RDB + AOF 混合模式
CONFIG SET save "900 1 300 10 60 10000"  # RDB：900秒内至少1次修改则保存
CONFIG SET appendonly yes                 # 开启 AOF
```

## 主从复制与哨兵

中级开发不需要自己搭集群，但需要理解概念：

```
┌──────────┐
│  Master  │ ← 写操作
└────┬─────┘
     │ 异步复制
┌────▼─────┐  ┌──────────┐
│ Slave 1  │  │ Slave 2  │ ← 读操作（读写分离）
└──────────┘  └──────────┘
         │
    ┌────▼─────┐
    │ Sentinel │ ← 监控+自动故障转移
    └──────────┘
```

- **主从复制**：读写分离，分担读压力
- **哨兵（Sentinel）**：监控 Master 状态，挂了自动选举新 Master
- **集群（Cluster）**：数据分片，突破单机内存上限

## 分布式锁

Redis 最常见的并发控制手段。用 `SET NX EX` 实现：

```js
// 获取锁（NX=不存在时才设置，EX=过期时间）
const lockKey = 'lock:order:001';
const locked = await redis.set(lockKey, 'locked', { NX: true, EX: 10 });

if (locked) {
  try {
    // 执行业务逻辑...
  } finally {
    // 释放锁（lua 脚本保证原子性：只有锁持有者才能释放）
    const script = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(script, { keys: [lockKey], arguments: ['locked'] });
  }
}
```

> 分布式锁的核心三要素：**互斥**（同一时刻只有一个客户端持有）、**防死锁**（设置过期时间）、**解锁安全**（谁加锁谁解锁，防止误删）。

## 缓存常见模式

### Cache Aside（旁路缓存）——最常用

前面基础篇已实现。更新策略：**先更新数据库，再删除缓存**（而不是更新缓存）。

### Write Through（写穿透）

写操作同时更新缓存和数据库。适合读多写少、对数据一致性要求高的场景。

### Write Behind（写回）

先写缓存，异步批量写回数据库。适合写多、对一致性要求低的场景（如浏览量计数）。

## Lua 脚本

Redis 支持 Lua 脚本，所有命令在脚本中**原子执行**：

```lua
-- 原子限流：每秒最多 10 次请求
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local current = redis.call('GET', key)
if current and tonumber(current) >= limit then
  return 0  -- 触发限流
else
  redis.call('INCR', key)
  redis.call('EXPIRE', key, 1)
  return 1  -- 放行
end
```

## 学习小结

- [x] 掌握了 Pub/Sub 与 Stream 的区别和选型
- [x] 熟悉了 Bitmaps / HyperLogLog / Geospatial 的实战场景
- [x] 理解了 RDB 和 AOF 两种持久化的权衡
- [x] 建立了主从复制、哨兵和集群的**概念认知**
- [x] 掌握了分布式锁的实现三要素
- [x] 学会了使用 Lua 脚本实现原子操作

---

## 参考资源

- [Redis 官方文档](https://redis.io/docs/)
- [Redis 命令参考](https://redis.io/commands/)

