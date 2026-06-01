# PostgreSQL 进阶

从基础 CRUD 到中级后端开发所需的 PG 能力。PostgreSQL 在高级特性上比 MySQL 丰富得多——很多你在 MySQL 中需要用应用层代码实现的功能，PG 原生内置。

> 如果你是从 MySQL 转过来的，本文会标注 **"相比 MySQL"** 来突出 PG 的差异化优势。

## JSONB：当 NoSQL 遇上关系型

PostgreSQL 对 JSON 的支持是同类产品中最强的——它既有 MongoDB 那样的文档灵活性，又有关系型数据库的事务和索引能力。

### JSON vs JSONB

```sql
-- JSON：存原始文本，保留空格和键顺序，每次查询都要重新解析
-- JSONB：存解析后的二进制，支持索引，查询更快（推荐）
```

### JSONB 基础操作

```sql
-- 建表
CREATE TABLE user_profiles (
    id       SERIAL PRIMARY KEY,
    user_id  INT    NOT NULL UNIQUE REFERENCES users(id),
    extra    JSONB  NOT NULL DEFAULT '{}'
);

-- 插入 JSON
INSERT INTO user_profiles (user_id, extra) VALUES
    (1, '{"city":"杭州","skills":["Go","Rust"],"level":"senior"}'),
    (2, '{"city":"北京","skills":["Python","AI"],"level":"mid"}');

-- 提取字段（-> 返回 JSON，->> 返回文本）
SELECT extra->>'city' AS city FROM user_profiles;
SELECT extra->>'level' AS level, COUNT(*) FROM user_profiles GROUP BY level;

-- 过滤 JSON 内的值
SELECT * FROM user_profiles WHERE extra->>'city' = '杭州';

-- 包含查询（@> 是 PG 独有操作符，检查 JSONB 是否包含某对象）
SELECT * FROM user_profiles WHERE extra @> '{"level":"senior"}';

-- 数组包含查询
SELECT * FROM user_profiles WHERE extra->'skills' ? 'Go';   -- skills 数组里有没有 "Go"

-- 更新 JSONB 内的字段
UPDATE user_profiles SET extra = jsonb_set(extra, '{level}', '"lead"') WHERE user_id = 1;

-- 追加数组元素
UPDATE user_profiles SET extra = jsonb_set(
    extra, '{skills}', (extra->'skills') || '["Rust"]'::jsonb
) WHERE user_id = 2;
```

### JSONB 索引

```sql
-- GIN 索引：加速 @>、?、?| 等包含查询
CREATE INDEX idx_extra ON user_profiles USING GIN (extra);

-- 对 JSONB 内特定路径建索引（更高效）
CREATE INDEX idx_extra_level ON user_profiles ((extra->>'level'));
```

> **相比 MySQL**：MySQL 的 JSON 类型也能做类似操作，但 PG 的 JSONB 支持 GIN 索引，查询性能和灵活性远高于 MySQL。如果你的应用有大量半结构化数据，PG 几乎是唯一选择。

## 高级索引

PG 的索引类型比 MySQL 丰富得多。MySQL 几乎只有 B-Tree（InnoDB），PG 有很多种，各有各的最优场景。

### 索引类型速览

| 类型 | 适用场景 | 示例 |
|------|---------|------|
| `B-Tree` | 默认索引，等值/范围查询 | `CREATE INDEX idx ON users (age)` |
| `Hash` | 仅等值查询（比 B-Tree 略快） | `CREATE INDEX idx ON users USING HASH (email)` |
| `GIN` | JSONB/数组/全文搜索 | `CREATE INDEX idx ON profiles USING GIN (extra)` |
| `GiST` | 地理空间/全文搜索 | `CREATE INDEX idx ON places USING GiST (location)` |
| `BRIN` | 超大规模顺序数据（TB 级） | `CREATE INDEX idx ON logs USING BRIN (created_at)` |

### 部分索引（Partial Index）

只对符合条件的数据建索引，比全表索引更小、更快：

```sql
-- 只对活跃用户建索引（90%的查询只查活跃用户）
CREATE INDEX idx_active_users ON users (created_at)
WHERE is_active = true;
```

### 表达式索引

对计算结果建索引：

```sql
-- 经常按邮箱域名搜索
CREATE INDEX idx_email_domain ON users ((split_part(email, '@', 2)));

-- 查询可以命中索引
SELECT * FROM users WHERE split_part(email, '@', 2) = 'gmail.com';
```

### 覆盖索引（INCLUDE）

将常用列包含在索引中，避免回表：

```sql
CREATE INDEX idx_user ON users (username) INCLUDE (email, age);

-- 下面这个查询只读索引，不碰数据表
SELECT username, email, age FROM users WHERE username = '张三';
```

### EXPLAIN ANALYZE 分析查询

```sql
EXPLAIN ANALYZE SELECT * FROM users WHERE username = '张三';
```

解读重点：

| 指标 | 含义 |
|------|------|
| `Seq Scan` | 全表扫描（需要优化） |
| `Index Scan` | 索引扫描 + 回表（正常） |
| `Index Only Scan` | 只读索引不读表（最优） |
| `Bitmap Index Scan` | 位图扫描（适合中等选择性） |
| `cost=0.00..1.23` | 启动代价..总代价（相对值，越小越好） |
| `actual time=...` | 实际执行耗时 |
| `rows=...` | 实际返回行数 |

## 窗口函数进阶

PG 的窗口函数完全遵循 SQL 标准，和 MySQL 8.0+ 基本相同，但 PG 支持更强的分析功能：

```sql
-- 排名
SELECT
    username, age,
    ROW_NUMBER() OVER (ORDER BY age DESC)  AS row_num,
    RANK()       OVER (ORDER BY age DESC)  AS rank_val,
    DENSE_RANK() OVER (ORDER BY age DESC)  AS dense_val,
    NTILE(4)     OVER (ORDER BY age DESC)  AS quartile
FROM users;

-- 分组内排名
SELECT username, age,
    ROW_NUMBER() OVER (PARTITION BY age GROUP ORDER BY created_at DESC) AS newest_first
FROM users;

-- 累计和
SELECT
    DATE(created_at),
    COUNT(*) AS daily,
    SUM(COUNT(*)) OVER (ORDER BY DATE(created_at)) AS cumulative
FROM users
GROUP BY DATE(created_at);

-- 前后行对比（LAG/LEAD）
SELECT
    username,
    age,
    LAG(age)  OVER (ORDER BY id) AS prev_age,
    LEAD(age) OVER (ORDER BY id) AS next_age,
    age - LAG(age) OVER (ORDER BY id) AS age_diff
FROM users;
```

## CTE（公共表表达式）与递归查询

CTE 让复杂查询像写代码一样清晰。PG 在这方面的实现比 MySQL 更早、更成熟：

```sql
-- 基础 CTE：拆解复杂查询
WITH active_users AS (
    SELECT id, username FROM users WHERE is_active = true
),
recent_orders AS (
    SELECT user_id, amount FROM orders
    WHERE created_at > CURRENT_DATE - INTERVAL '30 days'
)
SELECT u.username, COALESCE(SUM(o.amount), 0) AS total_spent
FROM active_users u
LEFT JOIN recent_orders o ON u.id = o.user_id
GROUP BY u.id, u.username;

-- 递归 CTE：组织架构树
WITH RECURSIVE org_tree AS (
    SELECT id, name, manager_id, 1 AS level
    FROM employees WHERE manager_id IS NULL
    UNION ALL
    SELECT e.id, e.name, e.manager_id, t.level + 1
    FROM employees e
    INNER JOIN org_tree t ON e.manager_id = t.id
)
SELECT * FROM org_tree ORDER BY level, name;
```

## MVCC 与事务隔离

### 什么是 MVCC？

MVCC（多版本并发控制）是 PG 实现高并发的核心机制。简单来说：

- 每次更新数据时，PG 保留旧版本而不是直接覆盖
- 读操作读的是事务开始时的数据快照——**读者永远不会阻塞写者，写者永远不会阻塞读者**
- 这意味着 PG 在绝大多数场景下不需要读锁

> MySQL InnoDB 也有 MVCC，但实现方式不同。PG 的 MVCC 更纯粹——它不需要 undo log，旧的版本直接存在数据页中。

### 隔离级别

```sql
-- 查看当前级别
SHOW transaction_isolation;

-- 设置级别
SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

PG 默认是 `READ COMMITTED`（与 MySQL 默认的 `REPEATABLE READ` 不同）。

| 场景 | PG 推荐 |
|------|--------|
| 一般 Web 应用 | `READ COMMITTED`（默认，性能最优） |
| 需要可重复读的报表 | `REPEATABLE READ` |
| 极端数据一致性要求 | `SERIALIZABLE` |

## 存储过程与函数（PL/pgSQL）

PG 的函数比 MySQL 的存储过程更强大，支持多种语言（SQL / PLpgSQL / Python / JavaScript 等）。

### 基本语法

```sql
-- 创建一个带返回值的函数
CREATE OR REPLACE FUNCTION get_user_count()
RETURNS INT AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM users);
END;
$$ LANGUAGE plpgsql;

-- 调用
SELECT get_user_count();
```

### 带参数的函数

```sql
CREATE OR REPLACE FUNCTION get_users_by_age(min_age INT, max_age INT)
RETURNS TABLE(username VARCHAR, email VARCHAR, age INT) AS $$
BEGIN
    RETURN QUERY
    SELECT u.username, u.email, u.age
    FROM users u
    WHERE u.age BETWEEN min_age AND max_age
    ORDER BY u.age;
END;
$$ LANGUAGE plpgsql;

-- 调用
SELECT * FROM get_users_by_age(20, 30);
```

### 转账存储过程实战

```sql
CREATE OR REPLACE FUNCTION transfer(
    from_id INT,
    to_id   INT,
    amount  NUMERIC
) RETURNS TEXT AS $$
DECLARE
    from_balance NUMERIC;
BEGIN
    -- 锁定转出账户行
    SELECT balance INTO from_balance FROM users WHERE id = from_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN '转出账户不存在';
    END IF;

    IF from_balance < amount THEN
        RETURN '余额不足';
    END IF;

    -- 执行转账
    UPDATE users SET balance = balance - amount WHERE id = from_id;
    UPDATE users SET balance = balance + amount WHERE id = to_id;

    RETURN '转账成功';
EXCEPTION
    WHEN OTHERS THEN
        RETURN '转账失败: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- 调用
SELECT transfer(1, 2, 100.00);
```

### 触发器：自动更新 updated_at

```sql
-- 创建触发器函数
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 绑定到表
CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
```

## 全文搜索

PG 内置全文搜索功能，不需要像 MySQL 那样额外配置或使用 Elasticsearch：

```sql
-- 创建文档表
CREATE TABLE articles (
    id      SERIAL PRIMARY KEY,
    title   TEXT NOT NULL,
    content TEXT NOT NULL,
    tsv     TSVECTOR    -- 全文搜索向量
);

-- 自动更新搜索向量
CREATE TRIGGER trg_articles_tsv
    BEFORE INSERT OR UPDATE ON articles
    FOR EACH ROW
    EXECUTE FUNCTION
        tsvector_update_trigger(tsv, 'pg_catalog.simple', title, content);

-- 插入数据
INSERT INTO articles (title, content) VALUES
    ('PostgreSQL基础', 'PostgreSQL是一个功能强大的开源数据库管理系统...'),
    ('MySQL入门', 'MySQL是最流行的关系型数据库之一...');

-- 全文搜索
SELECT title, ts_rank(tsv, query) AS rank
FROM articles, to_tsquery('simple', '数据库') query
WHERE tsv @@ query
ORDER BY rank DESC;
```

## 数据库角色与行级安全（RLS）

PG 支持行级别安全策略，这是 MySQL 不具备的能力——可以在数据库层面实现"用户只能看自己的数据"：

```sql
-- 开启 RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 创建策略：用户只能看自己的订单
CREATE POLICY user_orders ON orders
    FOR ALL
    USING (user_id = current_setting('app.current_user_id')::int);
```

## 扩展（Extensions）

PG 的扩展系统允许在不修改核心代码的情况下增加新功能：

```sql
-- 查看已安装的扩展
SELECT * FROM pg_extension;

-- 安装常用扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- UUID 生成
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- 加密函数
CREATE EXTENSION IF NOT EXISTS "postgis";        -- 地理空间
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- 模糊搜索加速
CREATE EXTENSION IF NOT EXISTS "hstore";         -- 键值对存储
```

## 性能优化清单

| 优化项 | 操作 | 预期效果 |
|--------|------|---------|
| 加索引 | `CREATE INDEX ON t(col)` | 查询加速 10~1000x |
| 升级为覆盖索引 | `CREATE INDEX ON t(a) INCLUDE (b,c)` | 避免回表，二次加速 |
| 用部分索引 | `CREATE INDEX ON t(col) WHERE active` | 索引空间减半 |
| 调大 shared_buffers | `shared_buffers = 25% of RAM` | 整体查询加速 |
| 开启并行查询 | `max_parallel_workers_per_gather = 4` | 大表聚合查询加速 |
| VACUUM 清理死元组 | `VACUUM ANALYZE t;` | 回收空间，更新统计信息 |
| EXPLAIN ANALYZE 诊断 | 找到全表扫描 → 加索引 | 针对性优化 |

## 三数据库对比总结

| 维度 | SQLite | MySQL | PostgreSQL |
|------|--------|-------|------------|
| 定位 | 嵌入式 | 通用 Web | 企业级、标准兼容 |
| SQL 标准 | 中等 | 中等偏弱 | **最强** |
| 数据类型 | 5 种亲和类型 | 标准 + JSON | **最丰富**（数组/JSONB/UUID/自定义） |
| 索引类型 | B-Tree | B-Tree + Fulltext | **最多**（B-Tree/Hash/GIN/GiST/BRIN/部分/表达式） |
| 并发模型 | 单写多读 | 多写多读 + MVCC | **MVCC 最纯粹**，读写互不阻塞 |
| 复制/高可用 | 不支持 | 主从/组复制 | **流复制/逻辑复制/Patroni** |
| 扩展性 | 扩展模块 | 插件 + 存储引擎 | **最灵活的扩展系统** |
| 最佳场景 | 本地/嵌入/移动 | 中小型 Web | 复杂查询/数据分析/地理空间/金融 |

> **快速决策口诀**：单机本地用 SQLite，常规 Web 用 MySQL，复杂查询/分析/地理/JSON 用 PostgreSQL。

## 学习小结

- [x] 掌握了 JSONB 的 CRUD 和 GIN 索引，理解了半结构化数据的最佳实践
- [x] 熟悉了 PG 的 5 种索引类型及各自的适用场景
- [x] 掌握了窗口函数、CTE 和递归查询
- [x] 理解了 MVCC 原理和事务隔离级别
- [x] 能写带参数、返回值、异常处理的事务型 PL/pgSQL 函数
- [x] 了解了触发器的实战用法
- [x] 理解了全文搜索和行级安全等 PG 独有特性
- [x] 建立了 SQLite → MySQL → PG 的渐进学习路径
