# SQLite 基础

SQLite 是一个轻量级、嵌入式的关系型数据库。与 MySQL 不同，它**无需独立服务端**——数据库就是一个单一的 `.sqlite` 文件，直接由应用程序读写。它的官方描述是"自包含、无服务器、零配置、事务性的 SQL 数据库引擎"。

## 数据库通识：关系型数据库核心概念

无论 MySQL、SQLite 还是 PostgreSQL，关系型数据库的底层逻辑是共通的。理解这些概念，跨数据库学习事半功倍：

**表（Table）** → 数据的二维结构，行（Row）代表记录，列（Column）代表字段。

**主键（Primary Key）** → 唯一标识一行记录的字段，通常用自增整数或 UUID。每张表必须有且仅有一个主键。

**外键（Foreign Key）** → 引用另一张表主键的字段，用于建立表之间的关系。例如 `orders.user_id` 引用 `users.id`。

**索引（Index）** → 加速查询的数据结构。类似于书的目录——没有索引，数据库需要全表扫描；有了索引，可以快速定位。

**事务（Transaction）** → 一组操作要么全部成功、要么全部撤销（原子性）。转账就是典型的事务场景。

**SQL（Structured Query Language）** → 操作关系型数据库的标准语言。SQLite 和 MySQL 共享 90% 以上的 SQL 语法。

> 学会了 SQLite 的 SQL，就等于学会了 MySQL 90% 的查询语法。差异主要在 DDL（建表）、函数和高级特性上。

## SQLite 凭什么特殊？

### 设计哲学

SQLite 的核心设计理念是**嵌入式**——数据库引擎不是一个独立的进程，而是编译进你的应用程序里。这意味着：

- **零配置**：不需要安装数据库服务、不需要配置端口、不需要创建用户
- **零管理**：没有守护进程要维护，没有 `systemctl` 或 `brew services` 要操心
- **可移植**：一个 `.sqlite` 文件拷贝到任何平台，SQLite 都能直接读写
- **紧凑**：完整功能的 SQL 引擎压缩后不到 1MB

### 为什么 SQLite 是世界上部署最广的数据库？

- 每台智能手机里都有 SQLite（iOS/Android 系统级使用）
- 每个浏览器都使用了类似 SQLite 的存储（WebSQL / IndexedDB 的某些实现）
- 几乎所有桌面软件（VS Code、Adobe 系列、Chrome）都使用 SQLite 存储配置和缓存
- Python 标准库自带 `sqlite3` 模块，Node.js 有 `better-sqlite3`

**你可能每天都在用 SQLite，只是没有意识到。**

## 环境搭建

### SQLite 命令行

macOS 自带 SQLite：

```bash
sqlite3 --version    # 查看版本
sqlite3 mydb.sqlite  # 创建/打开数据库
```

### DB Browser for SQLite

DB Browser for SQLite 是图形化管理工具，与 MySQL Workbench 角色类似。

主要功能：

- **可视化浏览**：查看数据库文件、表结构、数据内容
- **执行 SQL**：编写和运行 SQL 语句，带语法高亮
- **表设计**：通过 GUI 新建表、修改字段、设置主键和索引
- **数据编辑**：在"Browse Data"标签页直接增删改数据，类似 Excel 操作
- **导入导出**：支持 CSV 等多种格式

> 与 MySQL Workbench 的区别：DB Browser 更轻量（安装包仅几十 MB），不需要连接配置（直接打开文件），更适合个人学习和本地小工具开发。

### 连接与数据库操作

```bash
# 进入交互模式
sqlite3 mydb.sqlite

# 常用元命令（以 . 开头）
.help           # 帮助
.tables         # 列出所有表
.schema users   # 查看 users 表结构
.schema         # 查看所有建表语句
.databases      # 列出当前连接的数据库
.quit           # 退出
```

```sql
-- SQL 层面查看数据库
PRAGMA database_list;
```

SQLite 没有 `SHOW DATABASES` / `CREATE DATABASE` 概念——一个文件就是一个数据库，打开文件即连接。

### 配置项（PRAGMA）

SQLite 通过 `PRAGMA` 语句设置运行时参数，这是它的特色机制：

```sql
-- 开启外键约束（默认关闭，必须手动开启！）
PRAGMA foreign_keys = ON;

-- 查看当前外键设置
PRAGMA foreign_keys;

-- 设置同步模式（NORMAL 兼顾性能和安全）
PRAGMA synchronous = NORMAL;

-- 查看 SQLite 版本
PRAGMA user_version;
```

> **重要**：SQLite 的**外键约束默认是关闭的**。执行 `PRAGMA foreign_keys = ON;` 后才生效。建议在每次连接时主动开启。

## 表操作

### 创建表

SQLite 的 CREATE TABLE 语法与 MySQL 基本一致：

```sql
CREATE TABLE users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    email      TEXT    NOT NULL,
    age        INTEGER CHECK (age >= 0 AND age <= 150),
    balance    REAL    NOT NULL DEFAULT 0.0,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT    DEFAULT (datetime('now', 'localtime'))
);
```

### 类型亲和性（Type Affinity）

SQLite 的类型系统与 MySQL 有本质差异——它使用**类型亲和性**而非严格类型：

| 亲和性 | 涵盖的声明 | 实际存储 |
|--------|-----------|---------|
| `INTEGER` | INT, BIGINT, TINYINT, BOOLEAN | 整数 |
| `REAL` | FLOAT, DOUBLE, REAL | 浮点数 |
| `TEXT` | VARCHAR(N), TEXT, CHAR, CLOB | 文本 |
| `BLOB` | BLOB | 二进制 |
| `NUMERIC` | DECIMAL, NUMERIC, DATE, DATETIME | 数值或文本 |

> SQLite **不强制类型检查**——你可以在声明为 `TEXT` 的列里存入整数。这是灵活性也是风险：不会因为类型不匹配而报错，但也意味着数据校验需要在上层（应用代码）完成。**推荐实践中始终遵循声明的类型约束**，不要依赖这个"宽容"。

### 约束条件

SQLite 支持主流约束：

| 约束 | 说明 | 示例 |
|------|------|------|
| `PRIMARY KEY` | 主键（AUTOINCREMENT 可选） | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| `NOT NULL` | 非空 | `username TEXT NOT NULL` |
| `UNIQUE` | 唯一 | `UNIQUE(email)` |
| `CHECK` | 自定义校验表达式 | `CHECK(age >= 0 AND age <= 150)` |
| `DEFAULT` | 默认值 | `DEFAULT 1` |
| `FOREIGN KEY` | 外键（需 `PRAGMA foreign_keys = ON`） | `FOREIGN KEY (user_id) REFERENCES users(id)` |

### 修改表（与 MySQL 差异较大）

```sql
-- ✅ 添加字段
ALTER TABLE users ADD COLUMN phone TEXT;

-- ✅ 重命名表
ALTER TABLE users RENAME TO accounts;

-- ✅ 重命名字段（SQLite 3.25+）
ALTER TABLE users RENAME COLUMN phone TO mobile;

-- ❌ 不支持直接修改字段类型
-- ❌ 不支持直接删除字段
-- 需要：创建新表 → 迁移数据 → 删除旧表 → 重命名
```

> **这是 SQLite 最大的设计取舍之一**：为了保持代码简洁（核心代码约 15 万行，MySQL 约 200 万行），牺牲了 ALTER TABLE 的灵活性。实际开发中建议在设计阶段把表结构想清楚，减少后期 ALTER 需求。

### 外键实战

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE orders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    order_no   TEXT    NOT NULL UNIQUE,
    amount     REAL    NOT NULL,
    created_at TEXT    DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);
```

## 数据操作（CRUD）

SQLite 的 CRUD 语法与 MySQL 高度一致——这是关系型数据库标准化的价值：

```sql
-- 插入
INSERT INTO users (username, email, age) VALUES ('张三', 'zhangsan@example.com', 25);
INSERT INTO users (username, email, age) VALUES
    ('李四', 'lisi@example.com', 30),
    ('王五', 'wangwu@example.com', 28);

-- 存在则更新（MySQL 的 ON DUPLICATE 等价写法）
INSERT INTO users (username, email, age) VALUES ('张三', 'new@example.com', 26)
ON CONFLICT(username) DO UPDATE SET email = excluded.email, age = excluded.age;

-- 查询
SELECT * FROM users;
SELECT * FROM users WHERE age > 25;
SELECT * FROM users WHERE username LIKE '张%';
SELECT * FROM users ORDER BY age DESC LIMIT 10;
SELECT age, COUNT(*) FROM users GROUP BY age;
SELECT age, COUNT(*) FROM users GROUP BY age HAVING COUNT(*) > 1;

-- 聚合函数
SELECT COUNT(*), AVG(age), MAX(age), MIN(age), SUM(balance) FROM users;

-- 更新
UPDATE users SET age = 26 WHERE username = '张三';

-- 删除
DELETE FROM users WHERE id = 5;
```

> 与 MySQL 的 `ON DUPLICATE KEY UPDATE` 对应，SQLite 使用 `ON CONFLICT ... DO UPDATE`，语义相同，语法略有差异。

## SQLite 独有的亮点

### 1. 递归 CTE 生成测试数据

MySQL 8.0+ 的递归 CTE 语法和 SQLite 几乎相同，但 SQLite 不需要任何服务端配置就能跑：

```sql
INSERT INTO users (username, email, age)
WITH RECURSIVE cnt(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM cnt WHERE n < 1000
)
SELECT
    'user_' || n,
    'user_' || n || '@example.com',
    18 + abs(random() % 42)
FROM cnt;
```

### 2. JSON 支持

SQLite 内置 JSON 函数（无需像 MySQL 那样安装 JSON 类型扩展）：

```sql
-- 创建包含 JSON 的表
CREATE TABLE logs (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    payload TEXT NOT NULL  -- JSON 存在 TEXT 列
);

-- 插入 JSON
INSERT INTO logs (payload) VALUES ('{"event": "login", "user": "张三", "ts": "2026-01-01"}');

-- 查询 JSON 字段
SELECT json_extract(payload, '$.event') AS event_type FROM logs;
SELECT * FROM logs WHERE json_extract(payload, '$.user') = '张三';

-- 聚合 JSON
SELECT json_group_array(username) FROM users WHERE age > 25;
```

### 3. 全文搜索（FTS5）

SQLite 内置全文搜索引擎，适合实现本地搜索功能：

```sql
-- 创建全文索引表
CREATE VIRTUAL TABLE articles_fts USING fts5(title, content);

-- 插入文档
INSERT INTO articles_fts (title, content) VALUES
    ('SQLite入门', 'SQLite是一个轻量级数据库...'),
    ('MySQL进阶', 'MySQL是最流行的关系型数据库...');

-- 全文搜索
SELECT * FROM articles_fts WHERE articles_fts MATCH '数据库';
```

这在 MySQL 中需要专门的全文索引配置，而 SQLite 直接内置。

### 4. 内存数据库

SQLite 可以完全运行在内存中，速度极快，适合单元测试：

```bash
sqlite3 :memory:    # 创建一个仅在内存中存在的数据库
```

## 批量数据操作

### 命令行导入

```bash
# 进入 sqlite3 后
.mode csv
.import /path/to/data.csv users

# 跳过表头行
.import --csv --skip 1 /path/to/data.csv users
```

### DB Browser 导入

1. 打开数据库 → **File → Import → Table from CSV file**
2. 选择 CSV 文件
3. 勾选 "Column names in first line"
4. 确认导入

### Node.js 事务批量写入

```js
import Database from 'better-sqlite3';

const db = new Database('mydb.sqlite');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email    TEXT NOT NULL,
    age      INTEGER
  )
`);

// 事务批量插入——关键提升性能的手段
const insert = db.prepare('INSERT INTO users (username, email, age) VALUES (?, ?, ?)');
const insertMany = db.transaction((rows) => {
  for (const row of rows) insert.run(row.username, row.email, row.age);
});

const users = Array.from({ length: 1000 }, (_, i) => ({
  username: `user_${i + 1}`,
  email: `user_${i + 1}@example.com`,
  age: 18 + Math.floor(Math.random() * 42),
}));

insertMany(users);
db.close();
```

> SQLite 默认每条 INSERT 是一个独立事务。使用 `db.transaction()` 包裹批量插入，性能可提升 **10~50 倍**。这一点与 MySQL 类似，都是事务优化的核心手段。

## 辩证看待 SQLite 的局限

SQLite 不是 MySQL 的"简化版"，而是为不同场景设计的工具。理解它的局限，才能做出正确的技术决策。

### 并发写入受限

SQLite 支持**无限并发读**，但**写入是串行的**（同一时间只允许一个写操作）。这是其架构决定的——没有独立的服务端协调锁。

- 适合：读多写少、写入量 < 每秒几十次
- 不适合：高并发写入（如秒杀系统、高频日志采集）

> 实际数据：SQLite 在合理配置下可以支撑 **每秒数百次写入**。对绝大多数个人项目和中小型应用来说，这个瓶颈根本不会触及。

### 无网络访问能力

SQLite 是一个文件数据库，不能通过网络远程访问。多台服务器共享数据时，只能用 MySQL/PostgreSQL。

- 适合：单机应用、本地工具
- 不适合：分布式系统、需要多实例共享数据库

### ALTER TABLE 功能受限

前面已经提到，SQLite 不支持直接修改字段类型或删除字段。这在实际开发中需要额外的迁移步骤。

### 无用户权限系统

SQLite 没有 `CREATE USER`、`GRANT` 等概念——文件权限就是数据库权限。这在单用户场景中是便利，在多用户场景中是短板。

### 不适合的典型场景

| 场景 | 为什么不适合 | 替代方案 |
|------|------------|---------|
| 高并发 Web API 后端 | 写入串行，无法利用多核 | MySQL / PostgreSQL |
| 多实例共享数据库 | 无法网络访问 | MySQL / PostgreSQL |
| 需要精细权限控制 | 无用户系统 | MySQL / PostgreSQL |
| 数据量 > 1TB | 单文件限制，备份恢复慢 | PostgreSQL |

## 深入对比：不只是"轻量 vs 重量"

| 维度 | SQLite | MySQL | 辩证解读 |
|------|--------|-------|---------|
| **启动方式** | 打开文件 | 启动服务进程 | SQLite 的开发体验优势——写完代码直接跑，不用先 `brew services start` |
| **数据类型** | 类型亲和性（宽松） | 严格类型 | SQLite 的灵活是双刃剑：原型开发快，但生产数据校验需靠应用层 |
| **并发模型** | 单写多读 | 多写多读 + 连接池 | 并发量不超百 QPS 时，SQLite 的实际速度往往快于 MySQL（无网络开销） |
| **部署运维** | 零运维 | 需运维 | SQLite 无 DBA 也能跑——但这也意味着没有慢查询日志、性能监控等工具 |
| **SQL 兼容性** | 标准 SQL + 部分扩展 | 标准 SQL + 大量扩展 | 90% 日常 SQL 语法相同，学习迁移成本极低 |
| **生态工具** | 少但精（DB Browser） | 丰富（Workbench/DBeaver/等） | MySQL 的工具链更完整，SQLite 工具虽然少但足够用 |
| **备份** | 复制文件即可 | `mysqldump` | SQLite 的备份就是 `cp mydb.sqlite backup.sqlite`——简单到令人感动 |
| **社区与文档** | 官网文档顶级 | 社区庞大、资料丰富 | SQLite 官方文档是教科书级别的——但中文社区资料远少于 MySQL |

## 技术选型建议

### 选 SQLite 的场景

```
学习 SQL 入门           → SQLite（零门槛，打开文件就能写 SQL）
本地 CLI 工具            → SQLite（单文件，打包分发方便）
Electron / Tauri 桌面应用 → SQLite（嵌入式，与 App 同生命周期）
移动端本地数据库         → SQLite（iOS/Android 原生支持）
Agent 知识库 / 缓存       → SQLite（单机即可，无需部署服务）
CI/CD 单元测试           → SQLite（:memory: 模式，跑完即销毁）
原型开发 & Demo           → SQLite（改需求 → 删文件 → 重建，零心理负担）
小型 Web 应用（< 50 用户）→ SQLite（完全hold得住）
```

### 选 MySQL 的场景

```
多用户 Web 应用          → MySQL（连接池 + 并发读写）
团队协作开发             → MySQL（远程访问，共享数据库）
需要读写分离/主从复制    → MySQL
企业级权限管理           → MySQL
数据量 > 100GB           → MySQL
已有 MySQL 技术栈的团队   → 继续用 MySQL
```

### 两者都可以的场景

```
个人博客                 → SQLite 够用，MySQL 也没问题
后台管理系统             → 看并发量，百人以下 SQLite 可以胜任
数据分析和报表           → 都支持标准 SQL，按部署偏好选
```

> 核心判断标准：**是否需要多个进程/服务器同时读写数据库？** 不需要 → SQLite 优先。需要 → MySQL。

## 学习路线：SQLite + MySQL 互补

SQLite 和 MySQL 不是非此即彼的关系，而是**互补工具链**：

1. **入门**用 SQLite——零配置，专注 SQL 语法本身，不被打断
2. **进阶**用 MySQL——理解 C/S 架构、连接池、并发控制、运维等工程化话题
3. **开发**按场景选——本地工具用 SQLite，Web 服务用 MySQL
4. **测试**用 SQLite `:memory:`——跑单元测试比 MySQL 快数倍

## 学习小结

- [x] 理解了关系型数据库的**通用核心概念**（表/主键/外键/索引/事务/SQL）
- [x] 掌握了 SQLite 的**命令行**和 **DB Browser** 可视化操作
- [x] 理解了 SQLite 的设计哲学：**嵌入式、零配置、零运维**
- [x] 熟悉了 SQLite 的**类型亲和性**及其利弊
- [x] 掌握了与 MySQL 的 **ALTER TABLE 差异**及应对策略
- [x] 学会了 SQLite 的**独有特性**（JSON 支持、FTS5 全文搜索、递归 CTE）
- [x] 清楚了两者的**适用边界**：单机 vs 网络、低并发 vs 高并发
- [x] 建立了**辩证的技术选型思维**——没有银弹，只有合适的场景
