# PostgreSQL：AI 时代最适合的数据库

> 日期：2026-08-05
> 对应示例：`examples/pgsql-test/` + `examples/typeorm-pg-crud/`
> 前置知识：MySQL 基础、Milvus 向量检索、NestJS + TypeORM 基础

---

## 一、为什么 PG 是 AI 时代的数据库

### 1.1 问题的起点：AI 记忆需要「关系 + 向量」双能力

AI 产品的会话记录（豆包、Kimi、ChatGPT）需要两件事同时成立：

```
1. 关系查询：用户 → 会话 → 消息（一对多 JOIN）
   当用户登录，左侧要列出他的所有会话；点开会话要列出所有历史消息

2. 语义检索：在历史消息里按"意思"搜索
   用户问"上次讨论的向量检索方案"，要能命中"当时聊了 pgvector 的 cosine 距离"
```

### 1.2 MySQL 时代的解法：双写，维护两套系统

```
业务数据存 MySQL：
  conversations 表（user_id 外键 → users）
  messages 表（conversation_id 外键 → conversations）

向量存 Milvus：
  需要为 messages 单独建一个 collection
  id 要和 messages.id 保持一致（关联用）
  embedding 字段存向量

问题：
  ① 写入时要双写（MySQL + Milvus），两份数据容易不一致
  ② 查询时要先查 Milvus 拿 id → 再查 MySQL 拿内容 → 手动拼接
  ③ 维护两套系统的成本高
```

### 1.3 PostgreSQL 的解法：一张表搞定

PostgreSQL 通过 **pgvector 扩展**，让表可以多一个 `vector` 类型的字段：

```sql
CREATE EXTENSION IF NOT EXISTS vector;  -- 开启 pgvector

CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    embedding vector(1024),              -- ← 向量字段！普通关系表里直接加
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**对比总结：**

| | MySQL + Milvus | PostgreSQL + pgvector |
|--|---------------|----------------------|
| 存储 | 两份（MySQL + Milvus） | 一份（同一张表） |
| 写入 | 双写 | 写一次 |
| 关联查询 | 查两套再拼 | 一条 SQL JOIN |
| 语义检索 | 单独查 Milvus | `<=>` 操作符排序 |
| 维护 | 两套系统 | 一套 |

---

## 二、环境搭建（docker-compose）

### 2.1 compose 结构

```yaml
services:
  postgres:            # PG 16 + pgvector 扩展
    image: pgvector/pgvector:pg16
    container_name: pg_vector_db
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: 123456
      POSTGRES_DB: learn_pg
    volumes:
      - ./init-scripts:/docker-entrypoint-initdb.d   # ← 首次启动自动建表
  pgadmin:             # PG 的可视化管理界面
    image: dpage/pgadmin4:latest
    ports: ["8088:80"]
```

### 2.2 关键机制：init-scripts 自动建表

`./init-scripts:/docker-entrypoint-initdb.d` 挂载后，**容器第一次启动时**会按字母序执行该目录下的 `.sql` 文件。

> 类比：这就是 PG 版的"migration"——首次建库时一次性把表结构建好。

### 2.3 启动步骤

```bash
cd examples/pgsql-test
docker compose up -d
# 浏览器打开 http://localhost:8088 登录 pgAdmin（邮箱 249121486@qq.com / 密码 admin）
# 注册服务器 → 连接 pg_vector_db 容器，端口 5432，用户 user 或 admin
```

> ⚠️ 本仓库遇到的实际坑：compose 默认账号是 `admin/learn_pg`，但 `.env.example` 连接串是 `user/hello_pg`。要么统一账号，要么像我们那样补建 `user` 角色和 `hello_pg` 库。

---

## 三、方案一：纯 pg 驱动（pgsql-test）

### 3.1 连接池：db.mjs

```js
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function query(text, params) {
  return pool.query(text, params);
}
```

**为什么用 Pool 而不是 Client？**

```
Client：一次一个连接，用完即断，频繁建立连接开销大
Pool：  维护一组连接，用完归还，复用连接

类比：数据库连接池 ≈ HTTP keep-alive 连接池
```

### 3.2 标准 CRUD：users.mjs

```js
// 创建用户（RETURNING * 返回整行，省一次 SELECT）
async function createUser(name) {
  const { rows } = await query(
    "INSERT INTO users (name) VALUES ($1) RETURNING *",
    [name]
  );
  return rows[0];
}

// 按 ID 查询
async function getUserById(id) {
  const { rows } = await query("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] ?? null;
}

// 更新
async function updateUser(id, name) {
  const { rows } = await query(
    "UPDATE users SET name = $1 WHERE id = $2 RETURNING *",
    [name, id]
  );
  return rows[0] ?? null;
}
```

**关键点：参数化查询 `$1` `$2`**

```
❌ 错误：`INSERT INTO users (name) VALUES ('${name}')`
   → SQL 注入风险（name 里带引号/分号就炸了）

✅ 正确：`INSERT INTO users (name) VALUES ($1)` + 参数数组
   → pg 驱动自动转义，防注入
```

**`RETURNING *` 的作用**：INSERT/UPDATE/DELETE 后直接把受影响的行返回出来，不用再 SELECT 一次。

### 3.3 一对多关联：conversations.mjs

```js
// 根据用户 ID 查所有会话
async function getConversationsByUserId(userId) {
  const { rows } = await query(
    "SELECT * FROM conversations WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  return rows;
}
```

对应业务：用户登录后左侧的会话列表。

### 3.4 消息 CRUD + 向量化：messages.mjs

```js
// 延迟初始化 embedding 模型（第一次用时才创建）
let embeddings;
function getEmbeddings() {
  if (!embeddings) {
    embeddings = new OpenAIEmbeddings({
      model: process.env.EMBEDDING_MODEL || "text-embedding-v3",
      apiKey: process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY,
      configuration: {
        baseURL: process.env.EMBEDDINGS_URL || process.env.OPENAI_BASE_URL,
      },
    });
  }
  return embeddings;
}
```

**存消息时带上向量：**

```js
async function createMessage(conversationId, role, content, withEmbedding = false) {
  if (withEmbedding) {
    const vector = await getEmbeddings().embedQuery(content);  // 文本 → number[]
    const { rows } = await query(
      `INSERT INTO messages (conversation_id, role, content, embedding)
       VALUES ($1, $2, $3, $4::vector)                        -- ← ::vector 强转
       RETURNING id, conversation_id, role, content, created_at`,
      [conversationId, role, content, JSON.stringify(vector)]  // ← 数组转 JSON 字符串
    );
    return rows[0];
  }
  // 不带向量的普通插入...
}
```

**为什么 `JSON.stringify(vector)` + `::vector` 强转？**

```
embedQuery 返回 JS 的 number[]：[0.012, -0.034, 0.056, ...]
pg 驱动不认识 number[]，需要序列化成 JSON 字符串传过去
数据库端用 ::vector 把 JSON 字符串解析成 vector 类型

本质：文本 → 向量 → 存入 vector(1024) 字段
```

### 3.5 语义检索：searchSimilarMessages

```js
async function searchSimilarMessages(conversationId, searchText, limit = 5) {
  const vector = await getEmbeddings().embedQuery(searchText);
  const { rows } = await query(
    `SELECT id, conversation_id, role, content, created_at,
            1 - (embedding <=> $1::vector) AS similarity
     FROM messages
     WHERE conversation_id = $2 AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(vector), conversationId, limit]
  );
  return rows;
}
```

**核心语法：`<=>` 余弦距离操作符**

```
<=>    = 余弦距离（cosine distance，0 = 最相似，越接近 0 越像）
1 - <=> = 余弦相似度（cosine similarity，1 = 最相似）

这不是 PostgreSQL 原生的操作符！
是 pgvector 扩展新增的（CREATE EXTENSION vector 之后才有）

ORDER BY embedding <=> $1  → 按距离从小到大排（最近的排最前）
LIMIT 5                    → 取前 5 条
```

**索引加速（create_tables.sql 里建的）：**

```sql
CREATE INDEX idx_messages_embedding
    ON messages USING hnsw (embedding vector_cosine_ops);
```

HNSW 是近似最近邻索引，和 Milvus 里的 HNSW 是同一种算法，加速高维向量的最近邻搜索。

### 3.6 运行验证

```bash
cd examples/pgsql-test
npm start
```

输出：用户 CRUD → 会话 CRUD → 消息 CRUD → 语义检索（两条搜索词各返回 top 3，带 similarity 分数）。

---

## 四、方案二：TypeORM + NestJS（typeorm-pg-crud）

### 4.1 Entity 映射一对多关系

```ts
// user.entity.ts
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @OneToMany(() => Conversation, (c) => c.user)
  conversations: Conversation[];    // ← 一个用户有多个会话
}
```

```ts
// conversation.entity.ts
@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;                  // ← 外键字段

  @ManyToOne(() => User, (u) => u.conversations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' }) // ← 告诉 ORM 外键列名
  user: User;
}
```

**Entity 装饰器 ↔ SQL 的对应关系：**

| TypeORM 装饰器 | SQL 等价物 |
|---------------|-----------|
| `@PrimaryGeneratedColumn()` | `id SERIAL PRIMARY KEY` |
| `@Column({ name: 'user_id' })` | `user_id INTEGER` |
| `@ManyToOne` + `@JoinColumn({ name: 'user_id' })` | `FOREIGN KEY (user_id) REFERENCES users(id)` |
| `@OneToMany` | 反方向的引用（ORM 用，不产生新列） |

### 4.2 一对多关联查询：relations

```ts
// conversations.service.ts
async findConversationsByUserId(userId: number) {
  return this.em.findOne(User, {
    where: { id: userId },
    relations: { conversations: true },   // ← 自动 JOIN 拉出会话列表
    order: { conversations: { createdAt: 'DESC' } },
  });
}
```

**对比手写 SQL（3.3 节的 getConversationsByUserId）：**

```
手写 SQL：先查 users，再 WHERE user_id = $1 查 conversations，自己拼对象
ORM：     relations: { conversations: true } 一行搞定，TypeORM 自动生成 JOIN 并组装嵌套结构
```

### 4.3 语义检索：为什么还要用原生 SQL

```ts
async searchSimilarMessages(conversationId, searchText, limit = 5) {
  const vector = await this.embedQuery(searchText);
  const rows = await this.em.query(          // ← 原生 SQL！
    `SELECT id, conversation_id, role, content, created_at,
            1 - (embedding <=> $1::vector) AS similarity
     FROM messages
     WHERE conversation_id = $2 AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(vector), conversationId, limit],
  );
  return rows;
}
```

**为什么不能用 `repository.find()`？**

```
因为 <=> 是 pgvector 扩展的操作符，TypeORM 的查询构建器不认识它
只有通过 em.query() / dataSource.query() 写原生 SQL 才能用

类比：TypeORM 认标准的 SQL，扩展语法要靠原生 SQL 兜底
```

### 4.4 Controller：三个 REST 接口

```ts
@Controller('conversations')
export class ConversationsController {
  @Get('users/:userId')                 // GET /conversations/users/1
  findByUser(...) { ... }

  @Get(':id/messages')                  // GET /conversations/1/messages
  findMessages(...) { ... }

  @Post(':id/search')                   // POST /conversations/1/search
  search(@Body() dto: SemanticSearchDto) { ... }
}
```

### 4.5 curl 验证

```bash
# 用户 → 会话（一对多）
curl -s http://localhost:3005/conversations/users/1

# 会话 → 消息（一对多）
curl -s http://localhost:3005/conversations/1/messages

# 语义检索
curl -s -X POST http://localhost:3005/conversations/1/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"向量相似度怎么查","limit":3}'
```

---

## 五、两种方案对比

| 维度 | 纯 pg 驱动（pgsql-test） | TypeORM + NestJS（typeorm-pg-crud） |
|------|-------------------------|-----------------------------------|
| 代码形态 | .mjs 脚本直接跑 | Nest 服务 + 接口 |
| CRUD 写法 | 手写 SQL | Entity + Repository/EntityManager |
| 关联查询 | 手写 JOIN / WHERE | `relations: {...}` 自动组装 |
| 语义检索 | `<=>` 原生 SQL | `em.query()` 原生 SQL（一样） |
| 适用场景 | 脚本、Demo、教学 | 正式业务系统 |
| 学习成本 | 低 | 中（需懂装饰器 + DI） |

**实际开发选择**：业务系统用 TypeORM（关系查询省事），向量检索部分用 `em.query()` 写原生 SQL（扩展语法绕不开）。

---

## 六、本章学到的东西

- [x] 理解了 PG 相比 MySQL+Milvus 在 AI 时代的优势（单表 = 关系 + 向量）
- [x] 掌握了 pgvector 扩展：`CREATE EXTENSION vector`、`vector(1024)` 字段
- [x] 学会了 `<=>` 余弦距离操作符和 `1 - <=>` 相似度换算
- [x] 理解了 HNSW 向量索引的作用
- [x] 掌握了参数化查询 `$1` 防 SQL 注入
- [x] 掌握了 `RETURNING *` 语法（省一次 SELECT）
- [x] 理解了 `JSON.stringify(vector)` + `::vector` 的转换原理
- [x] 用 TypeORM `relations` 做了一对多关联查询
- [x] 理解了语义检索为什么必须用原生 SQL（扩展语法）
- [x] 跑通了两个项目的完整闭环

---

*昇哥 · 2026年8月*
