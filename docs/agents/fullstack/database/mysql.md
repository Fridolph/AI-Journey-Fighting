# MySQL


从零开始学习 MySQL，掌握基本的数据库操作和 SQL 语言。本文按初级后端工程师的日常工作标准编排，覆盖环境搭建、Workbench 操作、表设计、CRUD、批量处理，以及开发中常见的坑和最佳实践。

## 环境搭建

### MySQL Server 安装

```bash
# macOS
brew install mysql
brew services start mysql       # 启动服务
brew services stop mysql        # 停止
brew services restart mysql     # 重启

# 初次安装后运行安全配置（设置 root 密码等）
mysql_secure_installation
```

- 默认端口：**3306**
- 配置文件：`/etc/my.cnf`（Linux）或 `/usr/local/etc/my.cnf`（macOS Homebrew）

### MySQL Workbench

MySQL Workbench 是官方免费 GUI 工具，几乎覆盖了日常开发需要的所有操作。建议命令行 + Workbench 配合使用——DDL（建表改表）在 Workbench 里做更直观，DML（增删改查）建议在命令行或 Query Tab 里用 SQL 练手感。

**核心功能一览：**

| 功能区 | 位置 | 用途 |
|--------|------|------|
| SCHEMAS 面板 | 左侧边栏 | 浏览数据库/表/视图/存储过程，右键操作 |
| Query Tab | 中央区域（Ctrl+T 新建） | 编写 SQL，快捷键 Ctrl+Enter 执行 |
| 结果网格 | Query Tab 下方 | 查看查询结果，**可直接双击单元格编辑数据** |
| Table Inspector | 右键表 → Table Inspector | 查看详细元数据（DDL/索引/外键/行数） |
| Navigator | 顶部菜单 Database → | 数据导入导出、迁移向导 |
| Output 面板 | 底部 | 查看执行的 SQL 耗时和警告 |

**两种建表方式：**

1. **GUI 建表**：右键 Tables → Create Table → 在界面中填写字段名/类型/约束 → Apply。适合快速原型。
2. **SQL 建表**：在 Query Tab 中写 `CREATE TABLE` 语句执行。适合版本控制（可保存为 `.sql` 文件）。

### 连接数据库

```bash
# 命令行连接（本地）
mysql -u root -p

# 连接远程
mysql -h 192.168.1.100 -P 3306 -u username -p

# 连接时直接指定数据库
mysql -u root -p mydb
```

```sql
-- 查看所有数据库
SHOW DATABASES;

-- 选择数据库
USE mydb;

-- 查看当前选中的数据库
SELECT DATABASE();

-- 查看当前 MySQL 版本
SELECT VERSION();

-- 查看当前用户
SELECT USER();
```

## 数据库操作

```sql
-- 创建数据库
CREATE DATABASE mydb;

-- 创建时指定字符集和排序规则（推荐）
CREATE DATABASE mydb
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- 查看所有数据库
SHOW DATABASES;

-- 查看建库语句
SHOW CREATE DATABASE mydb;

-- 删除数据库（不可逆！）
DROP DATABASE mydb;
```

> **字符集说明**：`utf8mb4` 是 MySQL 真正的 UTF-8（标准 `utf8` 最多 3 字节，存不了 emoji）。`utf8mb4_unicode_ci` 是大小写不敏感的通用排序。新项目全部用 `utf8mb4`。

## 用户与权限管理

后端工程师经常需要在本地或服务器上创建专用数据库账号（而不是直接用 root）。

```sql
-- 创建用户
CREATE USER 'appuser'@'localhost' IDENTIFIED BY 'password';
CREATE USER 'appuser'@'%' IDENTIFIED BY 'password';           -- 允许远程连接

-- 授权：给某个数据库的全部权限
GRANT ALL PRIVILEGES ON mydb.* TO 'appuser'@'localhost';

-- 授权：只给 CRUD 权限（生产环境安全实践）
GRANT SELECT, INSERT, UPDATE, DELETE ON mydb.* TO 'appuser'@'localhost';

-- 刷新权限使生效
FLUSH PRIVILEGES;

-- 查看用户权限
SHOW GRANTS FOR 'appuser'@'localhost';

-- 修改密码
ALTER USER 'appuser'@'localhost' IDENTIFIED BY 'new_password';

-- 删除用户
DROP USER 'appuser'@'localhost';
```

> **安全铁律**：生产环境不要给应用账号 `DROP`、`ALTER`、`GRANT` 权限，严格按最小权限原则。

## 表操作

### 创建表

```sql
CREATE TABLE users (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username   VARCHAR(50)  NOT NULL,
    email      VARCHAR(100) NOT NULL,
    age        TINYINT UNSIGNED DEFAULT NULL,
    balance    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    is_active  TINYINT(1)   NOT NULL DEFAULT 1,
    created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_username (username),
    UNIQUE KEY uk_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 约束条件一览

| 约束 | 关键字 | 说明 | 示例 |
|------|--------|------|------|
| 主键 | `PRIMARY KEY` | 唯一 + 非空，每表仅一个 | `id INT PRIMARY KEY` |
| 非空 | `NOT NULL` | 字段不可为 NULL | `username VARCHAR(50) NOT NULL` |
| 唯一 | `UNIQUE` | 值不可重复，允许多个 NULL | `UNIQUE (email)` |
| 默认值 | `DEFAULT` | 插入时如果不填则使用默认值 | `is_active TINYINT(1) DEFAULT 1` |
| 自增 | `AUTO_INCREMENT` | 自动递增，仅用于整数主键 | `id INT AUTO_INCREMENT` |
| 外键 | `FOREIGN KEY` | 引用另一张表的主键 | `FOREIGN KEY (user_id) REFERENCES users(id)` |
| 检查 | `CHECK`（8.0.16+） | 自定义约束表达式 | `CHECK (age >= 0 AND age <= 150)` |

### 外键实战

```sql
CREATE TABLE orders (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     INT UNSIGNED NOT NULL,
    order_no    VARCHAR(32)  NOT NULL,
    amount      DECIMAL(10,2) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_order_no (order_no),
    KEY idx_user_id (user_id),
    CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT    -- 有订单时不允许删除用户
        ON UPDATE CASCADE     -- 用户 id 变更时自动同步
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

外键删除/更新策略：

| 选项 | 行为 |
|------|------|
| `RESTRICT` / `NO ACTION` | 有子记录时禁止删除/更新父记录（默认） |
| `CASCADE` | 父记录删除/更新时，子记录一起删除/更新 |
| `SET NULL` | 父记录删除时，子记录外键设为 NULL |
| `SET DEFAULT` | 父记录删除时，子记录外键设为默认值 |

> **开发建议**：外键在开发环境和中型项目推荐使用（保证数据完整性）；超高并发场景有时会去掉外键，在应用层通过代码保证一致性。

### 存储引擎选择

| 引擎 | 事务 | 行锁 | 外键 | 适用场景 |
|------|------|------|------|---------|
| `InnoDB` | ✅ | ✅ | ✅ | **默认首选，99% 的场景** |
| `MyISAM` | ❌ | ❌ | ❌ | 只读日志表、历史归档（几乎不再使用） |

> MySQL 5.5 起默认引擎就是 InnoDB，新项目不需要考虑 MyISAM，写 `ENGINE=InnoDB` 更多是显式声明习惯。

### AUTO_INCREMENT 细节

```sql
-- 插入后获取自增 ID（后端代码常用）
INSERT INTO users (username, email) VALUES ('test', 'test@example.com');
SELECT LAST_INSERT_ID();

-- 重置自增计数（清空表后从 1 开始）
TRUNCATE TABLE users;

-- 手动指定自增起始值
ALTER TABLE users AUTO_INCREMENT = 1000;
```

> 删除最后一行数据后再插入，自增 ID **不会回退**（例如删了 id=10 的记录，下一个插入仍是 id=11）。这是 InnoDB 的设计——保证主键的单调递增。

### 查看表

```sql
-- 查看所有表
SHOW TABLES;

-- 按名称过滤
SHOW TABLES LIKE '%user%';

-- 查看表结构
DESC users;
DESCRIBE users;

-- 查看建表语句（含完整 DDL）
SHOW CREATE TABLE users;

-- 查看表的详细元数据（行数、引擎、字符集等）
SELECT * FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'mydb' AND TABLE_NAME = 'users';
```

### 修改表（ALTER）

```sql
-- 添加字段
ALTER TABLE users ADD COLUMN phone VARCHAR(20) AFTER email;

-- 添加字段到最前
ALTER TABLE users ADD COLUMN uuid CHAR(36) FIRST;

-- 修改字段类型（注意可能截断数据！）
ALTER TABLE users MODIFY COLUMN age TINYINT UNSIGNED;

-- 同时修改字段名和类型
ALTER TABLE users CHANGE COLUMN phone mobile VARCHAR(20);

-- 设置默认值
ALTER TABLE users ALTER COLUMN is_active SET DEFAULT 1;

-- 删除默认值
ALTER TABLE users ALTER COLUMN is_active DROP DEFAULT;

-- 删除字段（不可逆！）
ALTER TABLE users DROP COLUMN mobile;

-- 添加索引
ALTER TABLE users ADD INDEX idx_created_at (created_at);

-- 重命名表
ALTER TABLE users RENAME TO accounts;
RENAME TABLE users TO accounts;
```

> **ALTER 注意事项**：对大表（百万行+）执行 `ALTER TABLE` 可能锁表很长时间，使用 `pt-online-schema-change`（Percona Toolkit）或 MySQL 8.0 的 `ALGORITHM=INSTANT` / `ALGORITHM=INPLACE` 减少锁表影响。

### 删除表

```sql
DROP TABLE users;

-- 安全版：存在才删除
DROP TABLE IF EXISTS users;

-- 清空表数据保留结构
TRUNCATE TABLE users;  -- 不可回滚，重置 AUTO_INCREMENT
DELETE FROM users;     -- 可回滚（在事务中），不重置自增
```

## 数据操作（CRUD）

### 插入数据（INSERT）

```sql
-- 指定字段插入（推荐，不怕表结构加字段）
INSERT INTO users (username, email, age) VALUES ('张三', 'zhangsan@example.com', 25);

-- 多行批量插入（效率远高于逐行插入）
INSERT INTO users (username, email, age) VALUES
    ('李四', 'lisi@example.com', 30),
    ('王五', 'wangwu@example.com', 28),
    ('赵六', 'zhaoliu@example.com', 22);

-- 存在则更新（主键或唯一键冲突时执行更新而不是报错）
INSERT INTO users (username, email, age) VALUES ('张三', 'new@example.com', 26)
ON DUPLICATE KEY UPDATE email = VALUES(email), age = VALUES(age);

-- 存在则忽略（主键冲突时什么都不做）
INSERT IGNORE INTO users (username, email, age) VALUES ('张三', 'x@example.com', 25);

-- 从查询结果插入（常用于备份或迁移）
INSERT INTO users_backup SELECT * FROM users WHERE created_at < '2026-01-01';
```

### 查询数据（SELECT）

```sql
-- ========== 基础查询 ==========

SELECT * FROM users;                          -- 查所有字段
SELECT id, username, email FROM users;        -- 查指定字段
SELECT username AS 用户名, email AS 邮箱 FROM users;  -- 别名

-- ========== 条件查询 ==========

SELECT * FROM users WHERE age > 25;
SELECT * FROM users WHERE age BETWEEN 20 AND 30;
SELECT * FROM users WHERE age IN (22, 25, 30);
SELECT * FROM users WHERE email IS NULL;
SELECT * FROM users WHERE email IS NOT NULL;

-- 多条件组合（AND 优先级高于 OR，复杂条件用括号明确）
SELECT * FROM users
WHERE age > 20
  AND (email LIKE '%@example.com' OR email LIKE '%@gmail.com');

-- ========== 模糊查询 ==========

SELECT * FROM users WHERE username LIKE '张%';     -- 以"张"开头
SELECT * FROM users WHERE username LIKE '%张%';     -- 包含"张"
SELECT * FROM users WHERE username LIKE '张_';      -- "张"后有一个字符
SELECT * FROM users WHERE email LIKE '%@gmail%';    -- GMail 用户

-- ========== 排序与分页 ==========

SELECT * FROM users ORDER BY age DESC;                    -- 年龄降序
SELECT * FROM users ORDER BY age DESC, id ASC;            -- 先按年龄降序再按 id 升序
SELECT * FROM users ORDER BY age DESC LIMIT 10;           -- 年龄最大的 10 人
SELECT * FROM users ORDER BY id LIMIT 20, 10;             -- 第 21~30 条（偏移 20，取 10）

-- ========== 去重 ==========

SELECT DISTINCT age FROM users;

-- ========== 聚合函数 ==========

SELECT COUNT(*)         FROM users;           -- 总行数
SELECT COUNT(email)     FROM users;           -- email 非 NULL 的行数
SELECT AVG(age)         FROM users;           -- 平均年龄
SELECT SUM(balance)     FROM users;           -- 余额总和
SELECT MAX(age), MIN(age) FROM users;         -- 最大/最小年龄

-- ========== 分组聚合 ==========

SELECT age, COUNT(*) AS cnt
FROM users
GROUP BY age;

SELECT age, COUNT(*) AS cnt
FROM users
GROUP BY age
HAVING cnt > 1;    -- 分组后过滤（WHERE 过滤行，HAVING 过滤组）

-- ========== 实用技巧 ==========

SELECT COUNT(*) FROM users;                   -- 快速估算（InnoDB 不走索引的话较慢）
SELECT COUNT(id) FROM users WHERE id > 0;     -- 走主键索引更快
```

### 更新数据（UPDATE）

```sql
-- 条件更新
UPDATE users SET age = 26 WHERE id = 1;

-- 多字段更新
UPDATE users SET age = 31, email = 'new_email@example.com' WHERE id = 2;

-- 表达式更新
UPDATE users SET age = age + 1 WHERE age < 30;
UPDATE users SET balance = balance * 1.05 WHERE id IN (1, 2, 3);  -- 余额涨 5%

-- ⚠️ 不带 WHERE = 更新全表！务必先用 SELECT 验证条件
-- 安全习惯：先写 SELECT，确认行数后再改成 UPDATE
```

### 删除数据（DELETE）

```sql
-- 条件删除
DELETE FROM users WHERE id = 5;

-- 批量删除
DELETE FROM users WHERE age < 18;

-- 多条件删除
DELETE FROM users WHERE is_active = 0 AND created_at < '2025-01-01';

-- 清空全表
DELETE FROM users;       -- 逐行删，会触发触发器，可回滚（在事务中）
TRUNCATE TABLE users;    -- 直接清空，不可回滚，不触发触发器，重置自增，更快

-- ⚠️ 同样：不带 WHERE = 删全表！
```

> **DELETE vs TRUNCATE**：开发环境清空测试数据用 `TRUNCATE`（快）；生产环境删数据用 `DELETE` + `WHERE` + 事务保护。

## 批量数据操作

### 通过 SQL 存储过程批量生成数据

```sql
DELIMITER //
CREATE PROCEDURE batch_insert_users(IN total INT)
BEGIN
    DECLARE i INT DEFAULT 1;
    WHILE i <= total DO
        INSERT INTO users (username, email, age)
        VALUES (
            CONCAT('user_', i),
            CONCAT('user_', i, '@example.com'),
            FLOOR(18 + RAND() * 42)
        );
        SET i = i + 1;
    END WHILE;
END //
DELIMITER ;

CALL batch_insert_users(1000);

-- 用完删除
DROP PROCEDURE IF EXISTS batch_insert_users;
```

> **存储过程 vs 脚本**：存储过程跑在数据库服务器上，网络开销小；脚本（Node/Python）在应用层，更灵活。批量的数据量级在 10 万行以内的测试数据用存储过程最省事。

### 通过 MySQL Workbench 导入 CSV

1. 右键目标表（或目标数据库）→ **Table Data Import Wizard**
2. 选择 CSV 文件路径
3. 选择目标表（可选"Create new table"自动建表）
4. 核对字段映射——确保 CSV 列与表字段一一对应
5. 点击 Next → 执行导入
6. 导入完成后查看 Output 面板确认行数

### 通过命令行导入导出

```bash
# 执行 SQL 文件
mysql -u root -p mydb < script.sql

# 导出整个数据库
mysqldump -u root -p mydb > backup.sql

# 导出单表（含建表语句）
mysqldump -u root -p mydb users > users.sql

# 只导出数据不含建表
mysqldump -u root -p --no-create-info mydb users > users_data.sql

# 只导出结构不含数据
mysqldump -u root -p --no-data mydb > schema.sql

# 导入 SQL 文件到数据库
mysql -u root -p mydb < backup.sql
```

### 通过 Node.js 脚本批量插入

```js
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'your_password',
  database: 'mydb',
});

// 准备 1000 条数据
const users = [];
for (let i = 1; i <= 1000; i++) {
  users.push([
    `user_${i}`,
    `user_${i}@example.com`,
    18 + Math.floor(Math.random() * 42),
  ]);
}

// 批量插入（一条 SQL 搞定，比循环插入快 10~50 倍）
await connection.query(
  'INSERT INTO users (username, email, age) VALUES ?',
  [users]
);

await connection.end();
```

## 备份与恢复

```bash
# ========== 全量备份 ==========
mysqldump -u root -p --all-databases > full_backup.sql

# ========== 单库备份 ==========
mysqldump -u root -p mydb > mydb_$(date +%Y%m%d).sql

# ========== 单表备份 ==========
mysqldump -u root -p mydb users > users_backup.sql

# ========== 恢复 ==========
mysql -u root -p mydb < backup.sql

# ========== 远程备份 ==========
mysqldump -h 192.168.1.100 -u root -p mydb > remote_backup.sql
```

> **建议**：养成在 `ALTER TABLE` 之前先 `mysqldump` 备份该表的习惯。数据无价，几秒钟的备份能省掉数小时的恢复。

## MySQL Workbench 每日工作流

以下是后端开发日常使用 Workbench 的典型流程：

1. **连接**：在首页点击数据库连接（提前配好 Host/Port/User）
2. **浏览**：左侧 SCHEMAS 面板 → 展开数据库 → 展开 Tables
3. **查数据**：右键表 → Select Rows - Limit 1000 → 查看数据概览
4. **写查询**：Ctrl+T 新建 Query Tab → 编写 SELECT/UPDATE → Ctrl+Enter 执行
5. **改数据**：在结果网格中直接双击单元格 → 编辑 → 点击 Apply（相当于自动生成 UPDATE）
6. **看表结构**：右键表 → Table Inspector → DDL 标签查看完整建表语句
7. **导入导出**：右键表 → Table Data Export/Import Wizard

## 常见错误与排查

| 错误信息 | 原因 | 解决 |
|---------|------|------|
| `Access denied for user` | 密码错或权限不足 | 检查用户名/密码，`SHOW GRANTS` 查看权限 |
| `Unknown database` | 数据库不存在或未 USE | `SHOW DATABASES;` 确认，`USE xxx;` 选择 |
| `Table already exists` | 表已存在 | `DROP TABLE IF EXISTS` 或 `CREATE TABLE IF NOT EXISTS` |
| `Duplicate entry for key` | 唯一键冲突 | `INSERT IGNORE` 或 `ON DUPLICATE KEY UPDATE` |
| `Data too long for column` | 插入值超过字段长度 | 检查 VARCHAR 长度，或改用 TEXT |
| `Cannot add or update a child row` | 外键约束失败 | 确认引用的父记录 id 存在 |
| `Lost connection to MySQL server` | 连接超时 | 增大 `wait_timeout`，或加 `reconnect: true` |

## 学习小结

- [x] 搭建 MySQL 环境，掌握 Workbench 的**日常操作流**（浏览/查询/编辑/导入导出）
- [x] 理解**字符集**（`utf8mb4`）和**存储引擎**（`InnoDB`）的选择
- [x] 掌握**约束**：主键 / 非空 / 唯一 / 默认 / 外键 / 自增
- [x] 熟练操作**表结构**：CREATE / ALTER / DROP / TRUNCATE
- [x] 熟练掌握 **CRUD**：INSERT / SELECT / UPDATE / DELETE
- [x] 掌握**聚合与分组**：COUNT / AVG / SUM / GROUP BY / HAVING
- [x] 学会**批量操作**：存储过程 / CSV 导入 / Node.js 脚本
- [x] 掌握**备份恢复**：`mysqldump` + 定期备份习惯
- [x] 了解**用户权限**管理和最小权限原则
- [x] 能排查**常见错误**（唯一键冲突、外键失败、连接超时等）


---

# 进阶

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

---

## 参考资源

- [MySQL 官方文档](https://dev.mysql.com/doc/)
- [MySQL Workbench 下载](https://dev.mysql.com/downloads/workbench/)

