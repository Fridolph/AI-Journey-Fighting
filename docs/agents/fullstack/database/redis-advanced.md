# Redis 进阶

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
