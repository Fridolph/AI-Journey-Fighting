# MySQL 进阶

从基础 SQL 到中级后端开发所需的数据库能力。涵盖字段设计、索引优化、高级查询、事务与锁等核心话题。

## 字段设计与类型选择

### 数值类型对比

| 类型 | 字节 | 范围（有符号） | 适用场景 |
|------|------|---------------|---------|
| `TINYINT` | 1 | -128 ~ 127 | 状态码、布尔、年龄 |
| `SMALLINT` | 2 | -32768 ~ 32767 | 数量、序号 |
| `MEDIUMINT` | 3 | -838万 ~ 838万 | 较少用 |
| `INT` | 4 | -21亿 ~ 21亿 | 主键 ID、一般计数 |
| `BIGINT` | 8 | -9e18 ~ 9e18 | 大数据量主键、时间戳毫秒 |
| `FLOAT` | 4 | 单精度浮点 | 不推荐（精度丢失） |
| `DOUBLE` | 8 | 双精度浮点 | 科学计算 |
| `DECIMAL(M,D)` | 变长 | 精确小数 | **金额、百分比（必须用）** |

> **铁律：金额和百分比字段必须使用 `DECIMAL`，禁止用 FLOAT/DOUBLE。**

### 字符串类型对比

| 类型 | 最大长度 | 存储 | 适用场景 |
|------|---------|------|---------|
| `CHAR(N)` | 255 | 定长 | 固定长度如 MD5、状态码 |
| `VARCHAR(N)` | 65535 | 变长 | 用户名、邮箱、标题 |
| `TEXT` | 65535 | 变长+外部 | 文章正文、JSON |
| `MEDIUMTEXT` | 16MB | 同上 | 大文本 |
| `LONGTEXT` | 4GB | 同上 | 超大文本 |

选择策略：
- 短字符串且长度固定 → `CHAR`（如 `CHAR(32)` 存 MD5）
- 短字符串变长 → `VARCHAR`（90% 的场景）
- 超过 5000 字符 → `TEXT`（不能设默认值）
- 超过 65535 → `MEDIUMTEXT`

### 时间类型对比

| 类型 | 格式 | 范围 | 时区 |
|------|------|------|------|
| `DATE` | YYYY-MM-DD | 1000~9999 | 无关 |
| `TIME` | HH:MM:SS | -838~838 | 无关 |
| `DATETIME` | YYYY-MM-DD HH:MM:SS | 1000~9999 | 无关 |
| `TIMESTAMP` | 同 DATETIME | 1970~2038 | **自动转 UTC** |

> 推荐：业务时间字段用 `DATETIME`（范围大、无时区转换），只有自动 `created_at`/`updated_at` 用 `TIMESTAMP`。

### 实战：用户表字段设计

```sql
CREATE TABLE users (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username      VARCHAR(50)     NOT NULL,
    email         VARCHAR(100)    NOT NULL,
    password_hash CHAR(60)        NOT NULL COMMENT 'bcrypt 哈希',
    avatar_url    VARCHAR(500)    DEFAULT NULL,
    role          TINYINT         NOT NULL DEFAULT 0 COMMENT '0普通 1管理员',
    balance       DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT '账户余额',
    is_active     TINYINT(1)      NOT NULL DEFAULT 1,
    last_login_at DATETIME        DEFAULT NULL,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_username (username),
    UNIQUE KEY uk_email (email),
    KEY idx_role_active (role, is_active),
    KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

设计要点：
- `BIGINT UNSIGNED` 作为主键（比 INT 更安全，42 亿上限容易打满）
- `DECIMAL(12,2)` 存金额（12 位整数 + 2 位小数 = 最多 9999 亿）
- `CHAR(60)` 存 bcrypt（固定 60 字符）
- `TINYINT` 存状态码和布尔值（比 ENUM 更易扩展）
- `utf8mb4` 字符集（支持 emoji）
- 合理的联合索引 `(role, is_active)` 加速后台筛选

## 索引

### 索引类型

| 类型 | 说明 | 典型场景 |
|------|------|---------|
| `PRIMARY KEY` | 主键索引，唯一且非空 | 每表必须有一个 |
| `UNIQUE KEY` | 唯一索引，值不可重复 | 用户名、邮箱、手机号 |
| `INDEX` / `KEY` | 普通索引 | 高频查询字段 |
| `FULLTEXT` | 全文索引 | 文章搜索 |
| `COMPOSITE INDEX` | 联合索引（多列） | 多条件组合查询 |

### 创建与删除索引

```sql
-- 创建单列索引
CREATE INDEX idx_username ON users (username);
ALTER TABLE users ADD INDEX idx_email (email);

-- 创建唯一索引
CREATE UNIQUE INDEX uk_email ON users (email);

-- 创建联合索引（注意列顺序！）
CREATE INDEX idx_role_created ON users (role, created_at);

-- 查看索引
SHOW INDEX FROM users;

-- 删除索引
DROP INDEX idx_username ON users;
ALTER TABLE users DROP INDEX idx_email;
```

### 联合索引与最左前缀

联合索引遵循**最左前缀原则**——查询条件必须从索引的最左列开始才能命中。

```sql
-- 索引：INDEX idx_a_b_c (a, b, c)

WHERE a = 1                          -- ✅ 命中（使用 a）
WHERE a = 1 AND b = 2                -- ✅ 命中（使用 a, b）
WHERE a = 1 AND b = 2 AND c = 3      -- ✅ 命中（使用全部）
WHERE a = 1 AND c = 3                -- ⚠️ 只命中 a（跳过了 b，c 无法使用）
WHERE b = 2                          -- ❌ 不命中（没从最左 a 开始）
WHERE b = 2 AND c = 3                -- ❌ 不命中
```

> 联合索引列顺序的黄金法则：**区分度高的列放前面，等值查询的列放前面，范围查询的列放后面。**

```sql
-- 好：先等值 role，再范围 created_at
INDEX idx_role_created (role, created_at);

-- 差：范围查询在前，后面的索引列无法使用
INDEX idx_created_role (created_at, role);
```

### EXPLAIN 查看执行计划

```sql
EXPLAIN SELECT * FROM users WHERE role = 1 AND created_at > '2026-01-01';
```

关注字段：

| 字段 | 含义 | 期望值 |
|------|------|--------|
| `type` | 访问类型 | `const` > `ref` > `range` > `index` > `ALL`（ALL 是全表扫描，必须避免） |
| `key` | 使用的索引 | 应匹配你创建的索引名 |
| `rows` | 扫描行数估算 | 越小越好 |
| `Extra` | 额外信息 | 避免 `Using filesort`（文件排序）和 `Using temporary`（临时表） |

### 索引设计原则

1. **WHERE / JOIN / ORDER BY 的列建索引**——查询最频繁的列优先
2. **高区分度列优先**——如 `email` 区分度高，`is_active` 只有 0/1 两值区分度低
3. **联合索引优于多个单列索引**——`INDEX(a,b)` 优于 `INDEX(a) + INDEX(b)`（多数场景）
4. **不要过度索引**——索引加速查询但拖慢写操作（INSERT/UPDATE/DELETE）
5. **避免在索引列上做函数运算**——`WHERE DATE(created_at) = '2026-01-01'` 不走索引
6. **用覆盖索引避免回表**——SELECT 的列都在索引中时，直接读索引不读数据行

## 聚合与高级查询

### 聚合函数

```sql
-- 基础聚合
SELECT
    COUNT(*)          AS total_users,
    AVG(age)          AS avg_age,
    MAX(age)          AS max_age,
    MIN(age)          AS min_age,
    SUM(balance)      AS total_balance
FROM users;

-- 分组聚合
SELECT role, COUNT(*) AS cnt
FROM users
GROUP BY role;

-- 带条件分组（HAVING 过滤聚合结果)
SELECT role, COUNT(*) AS cnt
FROM users
GROUP BY role
HAVING cnt > 10;

-- 多个聚合维度
SELECT
    role,
    DATE(created_at) AS reg_date,
    COUNT(*)         AS daily_cnt
FROM users
GROUP BY role, DATE(created_at)
ORDER BY reg_date DESC;
```

### JOIN 连接查询

```sql
-- INNER JOIN：两表匹配的行
SELECT u.username, o.order_no, o.amount
FROM users u
INNER JOIN orders o ON u.id = o.user_id;

-- LEFT JOIN：左表全部 + 右表匹配（右表无匹配则 NULL）
SELECT u.username, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id;

-- 多表 JOIN
SELECT u.username, o.order_no, p.name AS product_name
FROM users u
INNER JOIN orders o ON u.id = o.user_id
INNER JOIN order_items oi ON o.id = oi.order_id
INNER JOIN products p ON oi.product_id = p.id;
```

### 子查询

```sql
-- WHERE 子查询
SELECT * FROM users
WHERE id IN (
    SELECT user_id FROM orders WHERE amount > 1000
);

-- FROM 子查询（派生表）
SELECT role, avg_age
FROM (
    SELECT role, AVG(age) AS avg_age
    FROM users
    GROUP BY role
) AS role_stats
WHERE avg_age > 25;

-- SELECT 子查询（标量子查询）
SELECT
    username,
    (SELECT COUNT(*) FROM orders WHERE user_id = users.id) AS order_count
FROM users;
```

### 窗口函数（MySQL 8.0+）

```sql
-- ROW_NUMBER：行号
SELECT username, age,
    ROW_NUMBER() OVER (ORDER BY age DESC) AS rank_by_age
FROM users;

-- RANK / DENSE_RANK：排名
SELECT username, balance,
    RANK() OVER (ORDER BY balance DESC)       AS rank_val,      -- 1,1,3,4
    DENSE_RANK() OVER (ORDER BY balance DESC) AS dense_rank_val -- 1,1,2,3
FROM users;

-- 分组内排名
SELECT username, role, age,
    ROW_NUMBER() OVER (PARTITION BY role ORDER BY age DESC) AS rank_in_role
FROM users;

-- 累计求和
SELECT
    DATE(created_at) AS reg_date,
    COUNT(*)         AS daily_cnt,
    SUM(COUNT(*))    OVER (ORDER BY DATE(created_at)) AS cumulative_cnt
FROM users
GROUP BY DATE(created_at);
```

### UNION 合并结果集

```sql
-- UNION：去重合并
SELECT email FROM users
UNION
SELECT email FROM deleted_users;

-- UNION ALL：不去重合并（更快）
SELECT email FROM users
UNION ALL
SELECT email FROM deleted_users;
```

## 事务与锁

### 事务基础

```sql
-- 开启事务
START TRANSACTION;

-- 执行操作
UPDATE users SET balance = balance - 100 WHERE id = 1;
UPDATE users SET balance = balance + 100 WHERE id = 2;

-- 检查结果后决定
COMMIT;    -- 提交
ROLLBACK;  -- 回滚
```

ACID 四大特性：

| 特性 | 说明 | 反例 |
|------|------|------|
| **A**tomicity 原子性 | 全部成功或全部回滚 | 转账一半崩溃 |
| **C**onsistency 一致性 | 事务前后数据约束不变 | 余额变负数 |
| **I**solation 隔离性 | 事务间互不干扰 | 脏读、不可重复读 |
| **D**urability 持久性 | 提交后永久保存 | 断电丢失数据 |

### 隔离级别

| 级别 | 脏读 | 不可重复读 | 幻读 | 性能 |
|------|------|-----------|------|------|
| READ UNCOMMITTED | ✅ | ✅ | ✅ | 最高 |
| READ COMMITTED | ❌ | ✅ | ✅ | 较高 |
| REPEATABLE READ (默认) | ❌ | ❌ | ✅ | 中等 |
| SERIALIZABLE | ❌ | ❌ | ❌ | 最低 |

```sql
-- 查看当前隔离级别
SELECT @@transaction_isolation;

-- 设置隔离级别
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

### 行锁与表锁

InnoDB 默认使用行级锁，但行锁依赖于**索引**：

```sql
-- 行锁：WHERE 条件使用索引
UPDATE users SET balance = 0 WHERE id = 1;       -- 锁 id=1 这一行
UPDATE users SET balance = 0 WHERE username = 'a'; -- 锁 username='a' 这一行（需有索引）

-- 表锁：WHERE 条件不使用索引（全表扫描 → 锁全表）
UPDATE users SET balance = 0 WHERE age > 100;    -- age 无索引 → 锁全表！
```

> **后端开发铁律：UPDATE/DELETE 的 WHERE 条件必须走索引，否则锁全表，并发时直接炸穿。**

### 乐观锁与悲观锁

```sql
-- 悲观锁（SELECT ... FOR UPDATE）：先锁再改
START TRANSACTION;
SELECT balance FROM users WHERE id = 1 FOR UPDATE;  -- 锁定这一行
-- 检查余额...
UPDATE users SET balance = balance - 100 WHERE id = 1;
COMMIT;

-- 乐观锁（版本号/时间戳）：先读再改，改时检查版本
UPDATE users
SET balance = balance - 100, version = version + 1
WHERE id = 1 AND version = @old_version;
-- 如果 affected_rows = 0，说明数据被他人修改，重试
```

| 方式 | 实现 | 适用场景 |
|------|------|---------|
| 悲观锁 | `SELECT ... FOR UPDATE` | 冲突概率高、事务短 |
| 乐观锁 | `version` 字段 | 冲突概率低、读多写少 |

## 视图与存储过程

### 视图

```sql
-- 创建视图
CREATE VIEW user_order_summary AS
SELECT u.id, u.username, COUNT(o.id) AS order_cnt, COALESCE(SUM(o.amount), 0) AS total_amount
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id;

-- 查询视图（像查普通表一样）
SELECT * FROM user_order_summary WHERE order_cnt > 5;

-- 删除视图
DROP VIEW IF EXISTS user_order_summary;
```

### 存储过程

```sql
DELIMITER //
CREATE PROCEDURE transfer(
    IN from_user BIGINT,
    IN to_user   BIGINT,
    IN amount    DECIMAL(12,2),
    OUT result   INT
)
BEGIN
    DECLARE from_balance DECIMAL(12,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET result = -1; -- 失败
    END;

    START TRANSACTION;
    SELECT balance INTO from_balance FROM users WHERE id = from_user FOR UPDATE;

    IF from_balance < amount THEN
        ROLLBACK;
        SET result = -2; -- 余额不足
    ELSE
        UPDATE users SET balance = balance - amount WHERE id = from_user;
        UPDATE users SET balance = balance + amount WHERE id = to_user;
        COMMIT;
        SET result = 0; -- 成功
    END IF;
END //
DELIMITER ;

-- 调用
CALL transfer(1, 2, 100.00, @result);
SELECT @result;
```

## 慢查询优化

### 开启慢查询日志

```sql
-- 查看慢查询配置
SHOW VARIABLES LIKE 'slow_query%';
SHOW VARIABLES LIKE 'long_query_time';

-- 开启慢查询日志
SET GLOBAL slow_query_log = ON;
SET GLOBAL long_query_time = 1; -- 超过 1 秒记为慢查询
```

### 常见优化策略

| 问题 | 诊断 | 优化 |
|------|------|------|
| 全表扫描 | `EXPLAIN` 看 `type=ALL` | 加索引 |
| 索引不命中 | WHERE 条件对索引列做函数 | 改造 SQL，避免函数包裹 |
| 回表过多 | 需要回主键索引取数据 | 用覆盖索引 |
| 排序慢 | `Extra: Using filesort` | 利用索引自带排序 |
| 锁等待 | 事务长时间不提交 | 缩小事务范围，及时提交 |
| N+1 查询 | 循环内逐条查询 | 改用 JOIN 或 IN 批量查询 |

### 后端代码中的查询优化

```js
// ❌ 差：循环查询（N+1 问题）
for (const userId of userIds) {
  const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
}

// ✅ 好：一次批量查询
const users = await db.query('SELECT * FROM users WHERE id IN (?)', [userIds]);

// ❌ 差：SELECT *
const all = await db.query('SELECT * FROM users');

// ✅ 好：只查需要的字段
const names = await db.query('SELECT id, username FROM users');
```

## 学习小结

核心能力清单（初 → 中级后端）：

- [x] 合理选择字段类型（数值/字符串/时间），金额用 `DECIMAL`
- [x] 设计索引：单列 + 联合 + 唯一，理解最左前缀原则
- [x] 使用 `EXPLAIN` 分析查询计划和索引命中
- [x] 掌握聚合函数 + `GROUP BY` + `HAVING`
- [x] 掌握 `JOIN`（INNER / LEFT）和子查询
- [x] 了解窗口函数（`ROW_NUMBER` / `RANK` / `SUM OVER`）
- [x] 理解事务 ACID 和隔离级别
- [x] 理解行锁条件和乐观锁 vs 悲观锁
- [x] 基础慢查询诊断和 SQL 优化
- [x] 后端代码中避免 N+1 查询
