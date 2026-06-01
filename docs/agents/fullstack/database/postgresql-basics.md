# PostgreSQL 基础

PostgreSQL 是一个开源的对象-关系型数据库管理系统。相比 MySQL，它更强调 **SQL 标准兼容性**、**数据完整性**和**扩展性**。许多开发者从 MySQL 转向 PostgreSQL 后，会发现它在处理复杂查询、严格约束和高级数据类型时的表现更加出色。

> 如果你已经熟悉 MySQL，本文重点标注了 **"与 MySQL 不同之处"** 以及 **"PG 独有特性"**，帮助你快速迁移知识。

## 环境搭建

### 安装 PostgreSQL

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16

# 验证安装
psql --version
```

安装完成后，Homebrew 会自动创建一个与你的 macOS 用户名同名的数据库超级用户和一个同名的默认数据库。

### pgAdmin 图形化工具

pgAdmin 是 PostgreSQL 官方推荐的 GUI 管理工具，角色相当于 MySQL Workbench：

- 下载：https://www.pgadmin.org/download/
- macOS 也可通过 `brew install --cask pgadmin4` 安装

**核心功能：**

| 功能区 | 位置 | 用途 |
|--------|------|------|
| Browser 面板 | 左侧树形结构 | 浏览服务器/数据库/Schema/表 |
| Query Tool | 右键数据库 → Query Tool | 编写执行 SQL（Ctrl+Enter） |
| 结果网格 | Query Tool 下方 | 查看结果，可直接编辑单元格 |
| Properties | 选中对象后右侧面板 | 查看/编辑对象属性 |
| CREATE Script | 右键对象 → CREATE Script | 生成建表/建库 DDL |
| 导入导出 | 右键表 → Import/Export | CSV 等格式导入导出 |

> pgAdmin 首次启动需要设置主密码（用于加密存储你的数据库连接密码），这是 PG 的安全设计，与 MySQL Workbench 直接存密码不同。

### 用 psql 命令行连接

`psql` 是 PostgreSQL 自带的命令行客户端，比 MySQL 的 `mysql` 命令功能更丰富：

```bash
# 连接默认数据库
psql postgres

# 连接指定数据库
psql mydb

# 指定用户连接
psql -U myuser mydb

# 远程连接
psql -h 192.168.1.100 -p 5432 -U myuser mydb
```

> 默认端口：**5432**（MySQL 是 3306）

```sql
-- psql 元命令（以 \ 开头，不区分大小写）
\l           -- 列出所有数据库（MySQL: SHOW DATABASES）
\c mydb      -- 切换数据库（MySQL: USE mydb）
\dt          -- 列出当前 schema 的表（MySQL: SHOW TABLES）
\d users     -- 查看 users 表结构（MySQL: DESC users）
\du          -- 列出所有用户/角色
\dn          -- 列出所有 schema
\di          -- 列出所有索引
\dv          -- 列出所有视图
\df          -- 列出所有函数
\q           -- 退出
\?           -- 帮助
\h SELECT    -- SQL 语法帮助（例如 \h CREATE TABLE）
```

> `psql` 的元命令比 MySQL 的 `SHOW` 命令更统一且功能更强。建议花 10 分钟把 `\l \c \dt \d \du` 这几个最常用的练熟，日常开发效率提升很大。

## 核心概念：database 与 schema

**这是 PG 与 MySQL 最重要的架构差异之一。**

| 概念 | MySQL | PostgreSQL |
|------|-------|------------|
| 数据库集群 | 一个 MySQL 实例 | 一个 PostgreSQL 实例（可含多个 database） |
| 数据库 | Database | Database（两者概念相同） |
| Schema | 不存在（MySQL 中 database 就是 schema） | Schema——database 内的逻辑分组，类似命名空间 |
| 表的完整路径 | `database.table` | `database.schema.table` |

```sql
-- PG 中一个 database 可以有多个 schema
CREATE SCHEMA app;      -- 应用表放这里
CREATE SCHEMA archive;  -- 归档表放这里

-- 创建表时指定 schema
CREATE TABLE app.users (...);
CREATE TABLE archive.old_users (...);

-- 查询时带 schema 前缀
SELECT * FROM app.users;
```

> 默认有一个 `public` schema。如果不显式指定，表都会被创建在 `public` 下。实际项目建议建业务 schema 区分模块。

## 数据库操作

```sql
-- 创建数据库
CREATE DATABASE mydb;

-- 创建时指定所有者
CREATE DATABASE mydb OWNER myuser;

-- 查看所有数据库（在 psql 中也可以直接 \l）
SELECT datname FROM pg_database;

-- 切换数据库（psql 中）
\c mydb

-- 删除数据库
DROP DATABASE mydb;
```

## 用户/角色管理

PostgreSQL 使用"角色"（Role）统一管理用户和组，没有独立的 `CREATE USER` 概念（`CREATE USER` 实际上是 `CREATE ROLE ... LOGIN` 的别名）。

```sql
-- 创建可登录的角色（= MySQL 的 CREATE USER）
CREATE ROLE appuser WITH LOGIN PASSWORD 'password';

-- 或者用别名
CREATE USER appuser WITH PASSWORD 'password';

-- 创建不可登录的角色（= 角色组）
CREATE ROLE readonly;

-- 将角色授权给用户
GRANT readonly TO appuser;

-- 授权数据库权限
GRANT ALL PRIVILEGES ON DATABASE mydb TO appuser;

-- 授权 schema 权限（PG 特有，MySQL 无此概念）
GRANT ALL PRIVILEGES ON SCHEMA public TO appuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO appuser;

-- 查看角色列表
\du

-- 修改密码
ALTER ROLE appuser WITH PASSWORD 'new_password';

-- 删除角色
DROP ROLE appuser;
```

> **与 MySQL 的差异**：MySQL 的 `GRANT ALL ON mydb.*` 一次性搞定；PG 需要分别授权 database、schema、table 三层。这是 PG 精细权限控制的设计哲学——更安全，但初学时略繁琐。

## 表操作

### 创建表

```sql
CREATE TABLE users (
    id            SERIAL        PRIMARY KEY,
    username      VARCHAR(50)   NOT NULL UNIQUE,
    email         VARCHAR(100)  NOT NULL UNIQUE,
    age           INT           CHECK (age >= 0 AND age <= 150),
    balance       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    role           VARCHAR(20)   NOT NULL DEFAULT 'user',
    tags          TEXT[]        DEFAULT '{}',         -- PG 独有：数组类型
    metadata      JSONB         DEFAULT '{}',         -- PG 独有：JSONB
    is_active     BOOLEAN       NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ   DEFAULT NULL,        -- 带时区的时间戳
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

### 与 MySQL 的类型对比

| MySQL | PostgreSQL | 说明 |
|-------|-----------|------|
| `INT AUTO_INCREMENT` | `SERIAL` | 自增整数（PG 语法糖，底层是 SEQUENCE） |
| `BIGINT AUTO_INCREMENT` | `BIGSERIAL` | 自增大整数 |
| `TINYINT` | `SMALLINT` | PG 无 TINYINT，用 SMALLINT（2 字节） |
| `DECIMAL(M,D)` | `NUMERIC(M,D)` | 完全相同 |
| `VARCHAR(N)` | `VARCHAR(N)` | 完全相同 |
| `TEXT` | `TEXT` | 完全相同 |
| `BOOLEAN` | `BOOLEAN` | PG 的布尔是真正的布尔类型，值为 `true`/`false`，不是 0/1 |
| `JSON` | `JSONB` | PG 推荐用 JSONB（二进制 JSON，支持索引） |
| `ENUM` | 自定义 ENUM 类型 | `CREATE TYPE mood AS ENUM ('happy','sad');` |
| `DATETIME` | `TIMESTAMP` | `TIMESTAMPTZ` 带时区（推荐） |
| 数组 | 不支持 | `TEXT[]`、`INT[]` 等（PG 独有） |
| UUID | 不支持（需插件） | `UUID` 原生支持 |

### PG 独有类型速览

```sql
-- 数组：存多个标签
INSERT INTO users (username, email, tags) VALUES ('test', 't@example.com', '{developer,python,ai}');
SELECT * FROM users WHERE 'python' = ANY(tags);

-- JSONB：存灵活的结构化数据
UPDATE users SET metadata = '{"city":"杭州","skills":["Go","Rust"]}' WHERE id = 1;
SELECT * FROM users WHERE metadata @> '{"city":"杭州"}';

-- UUID：分布式系统常用主键
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SELECT uuid_generate_v4();

-- ENUM 自定义类型
CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer');
ALTER TABLE users ADD COLUMN role2 user_role DEFAULT 'viewer';
```

### 查看与修改表

```sql
-- 查看表结构
\d users
\d+ users          -- 更详细（含注释、存储大小）

-- 查看建表 DDL
SELECT pg_get_tabledef('users'::regclass);

-- 修改表（ALTER 功能比 SQLite 完整，与 MySQL 基本对等）
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
ALTER TABLE users ALTER COLUMN age TYPE SMALLINT;       -- 改类型
ALTER TABLE users ALTER COLUMN is_active SET DEFAULT true; -- 设默认值
ALTER TABLE users RENAME COLUMN phone TO mobile;         -- 重命名
ALTER TABLE users DROP COLUMN mobile;                    -- 删除字段
ALTER TABLE users RENAME TO accounts;                    -- 重命名表
```

> PG 的 ALTER TABLE 功能比 SQLite 完整，与 MySQL 相当。字段类型修改比 MySQL 更灵活——`TYPE` 可以直接指定新类型。

### 删除表

```sql
DROP TABLE IF EXISTS users;
TRUNCATE TABLE users;    -- 清空数据保留结构，重置 SEQUENCE
```

## 数据操作（CRUD）

PG 的 CRUD 语法与 MySQL 90% 一致，以下是标准操作和一些 PG 特有的便利写法：

### INSERT

```sql
-- 标准插入（与 MySQL 相同）
INSERT INTO users (username, email, age) VALUES ('张三', 'zhangsan@example.com', 25);

-- 批量插入（与 MySQL 相同）
INSERT INTO users (username, email, age) VALUES
    ('李四', 'lisi@example.com', 30),
    ('王五', 'wangwu@example.com', 28);

-- 返回插入的数据（PG 独有：RETURNING）
INSERT INTO users (username, email) VALUES ('赵六', 'zhaoliu@example.com')
RETURNING id, created_at;

-- 冲突时更新（PG 独有：ON CONFLICT，等同于 MySQL ON DUPLICATE KEY UPDATE）
INSERT INTO users (username, email, age) VALUES ('张三', 'new@example.com', 26)
ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, age = EXCLUDED.age;

-- 冲突时忽略
INSERT INTO users (username, email) VALUES ('张三', 'x@example.com')
ON CONFLICT (username) DO NOTHING;
```

> **`RETURNING` 是 PG 杀手级特性**——MySQL 需要额外执行 `SELECT LAST_INSERT_ID()` 来获取自增 ID，PG 直接在 INSERT 后返回需要的字段。

### SELECT

```sql
-- 基础查询（与 MySQL 相同）
SELECT * FROM users WHERE age > 25;
SELECT * FROM users ORDER BY age DESC LIMIT 10;
SELECT * FROM users LIMIT 10 OFFSET 20;    -- 第 21~30 条

-- 模糊查询（PG 用 ILIKE 做不区分大小写的匹配）
SELECT * FROM users WHERE username LIKE '张%';
SELECT * FROM users WHERE email ILIKE '%@GMAIL%';   -- PG 独有

-- 正则匹配（PG 独有：~ 运算符）
SELECT * FROM users WHERE email ~ '^[a-z]+@gmail\.com$';

-- 聚合（与 MySQL 相同）
SELECT age, COUNT(*) FROM users GROUP BY age HAVING COUNT(*) > 1;

-- DISTINCT ON（PG 独有：取每组第一条）
SELECT DISTINCT ON (age) id, username, age FROM users ORDER BY age, created_at DESC;
```

### UPDATE / DELETE

```sql
-- 更新（与 MySQL 相同）
UPDATE users SET age = 26 WHERE username = '张三';

-- 更新并返回（PG 独有）
UPDATE users SET age = age + 1 WHERE age < 30
RETURNING id, username, age;

-- 删除（与 MySQL 相同）
DELETE FROM users WHERE id = 5;

-- 删除并返回（PG 独有）
DELETE FROM users WHERE is_active = false
RETURNING id;
```

## 批量数据操作

### 使用 generate_series 生成数据

PG 的 `generate_series` 是生成测试数据的利器，不需要像 MySQL 那样写循环存储过程：

```sql
-- 一行 SQL 插入 1000 条测试数据
INSERT INTO users (username, email, age)
SELECT
    'user_' || n,
    'user_' || n || '@example.com',
    18 + floor(random() * 42)::int
FROM generate_series(1, 1000) AS n;
```

> 对比：MySQL 需要写十几行的存储过程循环，PG 用 `generate_series` 一行搞定。这是 PG 在日常开发中的一大效率优势。

### 命令行导入导出

```bash
# 备份整个数据库
pg_dump mydb > backup.sql

# 只导出结构
pg_dump --schema-only mydb > schema.sql

# 只导出数据
pg_dump --data-only mydb > data.sql

# 导出单表
pg_dump -t users mydb > users.sql

# 恢复
psql mydb < backup.sql

# CSV 导入（psql 内）
\copy users FROM '/path/to/data.csv' WITH (FORMAT csv, HEADER true);
```

### pgAdmin 导入

1. 右键目标表 → **Import/Export Data**
2. 选择 Import，选择 CSV 文件
3. 勾选 Header（如果 CSV 有表头）
4. 确认分隔符和编码
5. 执行

### Node.js 批量写入

```js
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'appuser',
  password: 'password',
  database: 'mydb',
});

const client = await pool.connect();

try {
  await client.query('BEGIN');

  const values = [];
  for (let i = 1; i <= 1000; i++) {
    values.push(`('user_${i}', 'user_${i}@example.com', ${18 + Math.floor(Math.random() * 42)})`);
  }

  await client.query(`
    INSERT INTO users (username, email, age) VALUES ${values.join(',')}
  `);

  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

## 新手必知：几个容易踩的坑

| 坑 | 说明 | 解决 |
|----|------|------|
| 连接被拒绝 | PG 默认只允许本地连接 | 修改 `pg_hba.conf`，或确认 `listen_addresses = '*'` |
| schema 权限 | MySQL 里 `GRANT ALL ON db.*` 搞定，PG 还要单独 `GRANT ON SCHEMA` | 记得三步：database → schema → tables |
| 字符串用单引号 | PG 严格遵循 SQL 标准，字符串必须用 `'单引号'`，双引号是标识符 | `WHERE name = '张三'` ✅，`WHERE name = "张三"` ❌ |
| 大小写 | PG 默认把未加引号的标识符转为小写 | 建表时推荐全部小写 + 下划线，避免用驼峰 |
| 布尔值 | `true`/`false` 而非 `1`/`0` | `WHERE is_active = true` ✅ |
| 自增 | 没有 `AUTO_INCREMENT`，用 `SERIAL` | `id SERIAL PRIMARY KEY` |

## 学习小结

- [x] 搭建了 PG 环境，掌握了 `psql` 元命令和 pgAdmin 的基本操作
- [x] 理解了 PG 的 **database→schema→table 三级架构**（与 MySQL 的重要差异）
- [x] 掌握了 PG 的**角色/权限管理**（Role 统一用户和组）
- [x] 熟悉了 PG 的**特有数据类型**（SERIAL/BOOLEAN/JSONB/数组/TIMESTAMPTZ）
- [x] 熟练了 CRUD 操作及 PG 独有语法（`RETURNING`/`ON CONFLICT`/`ILIKE`/`DISTINCT ON`）
- [x] 学会了用 `generate_series` 高效生成测试数据
- [x] 掌握了 `pg_dump` 备份恢复和 CSV 导入
- [x] 避开了新手常见的 6 个坑
