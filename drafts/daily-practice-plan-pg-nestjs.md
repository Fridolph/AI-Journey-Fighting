# PostgreSQL + NestJS 每日回顾计划

> 目标：保持手感，不追求新知识灌输。每天 20~30 分钟，一个独立小练习。
>
> 节奏：一天 PG，一天 NestJS，交错进行，避免疲劳。
>
> 用到就查，不背命令。文档已经写好了（`docs/`），练习只是帮你"重新建立肌肉记忆"。

---

## 基础环境（先决条件）

```bash
# PostgreSQL（brew 安装，本地常驻）
brew services start postgresql@17

# 测试连接
psql -U fri -d hello_pg

# NestJS 项目（可同时启动，不运行也行）
cd examples/typeorm-pg-crud && pnpm install
cd examples/nest-feature && pnpm install
```

---

## 第 1 周：核心手感唤醒

### Day 1 — PG：连上去，建一张表

**目标**：重新熟悉 `psql` 环境和建表语法

```
① psql -U fri -d hello_pg
② CREATE TABLE daily_log (
    id SERIAL PRIMARY KEY,
    tag VARCHAR(20) NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );
③ \dt                     -- 看表
④ \d daily_log            -- 看结构
```

*参考：`docs/agents/fullstack/database/postgresql.md` → 环境搭建 / 创建表*

---

### Day 2 — NestJS：看懂一个 Module 是怎么拼起来的

**目标**：理解 Module → Controller → Service 的三层关系

```
打开 examples/nest-feature/src/user/
  ① user.module.ts     → 看 @Module 里声明了哪些东西
  ② user.controller.ts → 看 @Controller('users') + @Get/@Post/@Delete
  ③ user.service.ts    → 看 @Injectable + 业务逻辑

回答自己一个问题：
  "一个 GET /users 请求，从进来到出去，经过了哪些文件？"
```

*参考：`drafts/nest-langchain/01-Nest-LangChain-SSE流式AI接口.md` → Nest 核心概念*

---

### Day 3 — PG：INSERT + SELECT + RETURNING

**目标**：写几条数据，感受 PG 特有的 `RETURNING` 语法

```sql
INSERT INTO daily_log (tag, content)
VALUES ('学习', '今天复习了 PG 基础')
RETURNING *;                            -- ← MySQL 没有这个

SELECT * FROM daily_log
WHERE tag = '学习'
ORDER BY created_at DESC;

UPDATE daily_log
SET content = '今天复习了 PG 基础，感觉不错'
WHERE id = 1
RETURNING id, content, created_at;       -- ← 一步返回更新后的行
```

*参考：`postgresql.md` → CRUD 基本操作 / RETURNING 子句*

---

### Day 4 — NestJS：TypeORM Entity 长什么样

**目标**：一句一句读懂一个 Entity 定义

```
打开 examples/typeorm-pg-crud/src/conversations/entities/user.entity.ts

逐行理解：
  @Entity('users')         → 映射到哪张表？
  @PrimaryGeneratedColumn()→ PG 的 SERIAL
  @Column({ nullable })    → 可选字段怎么标记？
  @CreateDateColumn()      → 自动设 created_at
  @OneToMany(...)          → 一对多关系（一个 User 有多个 Conversation）

随便改一个字段（比如加个 @Column() avatar: string），
然后跑 npm run start:dev 看看会不会自动同步表结构。
```

*参考：`postgresql.md` → TypeORM 基础*

---

### Day 5 — PG：条件查询 + ILIKE + DISTINCT

**目标**：用几个 PG 独有的查询语法做筛选

```sql
-- 模糊匹配（不区分大小写）← PG 独有，MySQL 无
SELECT * FROM daily_log WHERE content ILIKE '%pg%';

-- 去重
SELECT DISTINCT tag FROM daily_log;

-- 按天分组统计
SELECT
  date(created_at) AS day,
  count(*) AS cnt
FROM daily_log
GROUP BY day
ORDER BY day DESC;
```

*参考：`postgresql.md` → ILIKE / DISTINCT ON*

---

### Day 6 — NestJS：Controller 里写一个 CRUD 接口

**目标**：在 typeorm-pg-crud 里新增一个简单的 REST 接口

```
打开 conversations.controller.ts，看看 @Get @Post @Patch @Delete 怎么写

然后自己加一个：
  @Get('count')
  countAll() {
    return this.conversationsService.countAll();
  }

去 conversations.service.ts 补上：
  countAll() {
    return this.conversationsRepository.count();
  }

用 curl / Postman 测试：
  curl http://localhost:3000/conversations/count
```

---

### Day 7 — PG：JSONB 初体验

**目标**：PG 最有特色的类型——JSONB

```sql
-- 加个 JSONB 列
ALTER TABLE daily_log ADD COLUMN extra JSONB;

-- 插入 JSON 数据
UPDATE daily_log SET extra = '{"mood": "good", "minutes": 25}'
WHERE id = 1;

-- 查 JSON 里的字段
SELECT content, extra->>'mood' AS mood FROM daily_log;

-- 按 JSON 字段过滤
SELECT * FROM daily_log WHERE extra->>'minutes' > '20';
```

*参考：`postgresql.md` → JSONB 深度操作*

---

## 第 2 周：串联 + 小实战

### Day 8 — NestJS：DTO + Validation

**目标**：理解请求参数校验是怎么工作的

```
打开 examples/nest-feature/src/user/dto/create-user.dto.ts

看：
  @IsString()           → class-validator
  @IsEmail()            → 校验邮箱格式
  @ApiProperty()        → Swagger 文档

对比 typeorm-pg-crud/src/conversations/dto/ 的写法，
看看有 DTO 和没有 DTO 的区别。
```

*参考：`drafts/nest-langchain/02-Nest-Tool-定时任务功能.md` → DTO 校验*

---

### Day 9 — PG：索引 + EXPLAIN

**目标**：感受索引前后的查询差异

```sql
-- 先看没有索引时怎么查
EXPLAIN ANALYZE
SELECT * FROM daily_log WHERE tag = '学习';

-- 建一个索引
CREATE INDEX idx_daily_log_tag ON daily_log(tag);

-- 再看有索引后怎么查（注意 Seq Scan → Index Scan）
EXPLAIN ANALYZE
SELECT * FROM daily_log WHERE tag = '学习';
```

*参考：`postgresql.md` → 索引类型 / EXPLAIN ANALYZE*

---

### Day 10 — NestJS：Service 里写 TypeORM 查询

**目标**：在 Service 层写一个带查询条件的 find

```
打开 conversations.service.ts，在 findOne / findAll 旁边

加一个：
  findByTitle(title: string) {
    return this.conversationsRepository.find({
      where: { title: ILike(`%${title}%`) },
      order: { createdAt: 'DESC' }
    });
  }

Controller 加：
  @Get('search')
  search(@Query('title') title: string) {
    return this.conversationsService.findByTitle(title);
  }

测试：curl 'http://localhost:3000/conversations/search?title=xxx'
```

---

### Day 11 — PG：窗口函数

**目标**：一行 SQL 算排名

```sql
SELECT
  tag,
  content,
  created_at,
  ROW_NUMBER() OVER (PARTITION BY tag ORDER BY created_at DESC) AS rn
FROM daily_log;
```

*参考：`postgresql.md` → 窗口函数*

---

### Day 12 — NestJS：Guard + 拦截器

**目标**：理解请求进来 → Guard(鉴权) → Interceptor(包装) → Controller 的链路

```
打开 examples/nest-feature/src/common/guards/auth.guard.ts
  → 看 canActivate 怎么判断放行

打开 examples/nest-feature/src/common/interceptors/transform.interceptor.ts
  → 看 intercept 怎么把返回值包进 { code, data, message }

回答自己：
  "一个请求进来，先经过谁？再经过谁？最后到谁？"
```

*参考：`drafts/nest-langchain/01-Nest-LangChain-SSE流式AI接口.md` → 请求链路*

---

### Day 13 — PG：CTE 递归查询

**目标**：用递归 CTE 查树形结构（如组织架构、评论回复）

```sql
-- 先建个简单树表
CREATE TABLE departments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50),
  parent_id INT REFERENCES departments(id)
);

INSERT INTO departments (name, parent_id) VALUES
  ('公司', NULL),
  ('技术部', 1),
  ('前端组', 2),
  ('后端组', 2);

-- 从"技术部"往下递归找所有子部门
WITH RECURSIVE dept_tree AS (
  SELECT id, name, parent_id FROM departments WHERE name = '技术部'
  UNION ALL
  SELECT d.id, d.name, d.parent_id
  FROM departments d
  JOIN dept_tree dt ON d.parent_id = dt.id
)
SELECT * FROM dept_tree;
```

*参考：`postgresql.md` → CTE 递归查询*

---

### Day 14 — NestJS：从头写一个完整的 CRUD Module

**目标**：30 分钟内，从 Module → Entity → Service → Controller 走一遍

```
在 typeorm-pg-crud 里新建一个 daily-log 模块：

1. nest g module daily-log
2. 手写 daily-log.entity.ts（对应 Day 1 建的 daily_log 表）
3. 手写 daily-log.service.ts（findAll / findOne / create / update / remove）
4. 手写 daily-log.controller.ts（GET / POST / PATCH / DELETE）
5. 在 app.module.ts 里注册 TypeOrmModule.forFeature([DailyLog])

测试：
  curl -X POST http://localhost:3000/daily-log \
    -H 'Content-Type: application/json' \
    -d '{"tag":"NestJS","content":"完成了第一个全栈 CRUD"}'
```

---

## 使用建议

1. **不强求每天打卡**——隔天做也可以，关键是保持手感
2. **允许跳题**——今天累就做 Day 1 那种 5 分钟的，精力好就做 Day 14 那种
3. **文档是词典**——忘记语法直接翻 `postgresql.md` 或 `drafts/nest-langchain/`，不要硬想
4. **两周后循环**——Day 14 结束后不用写新计划，从 Day 1 重新开始但换一张新表/新 Entity，每轮换一个业务场景（如「健康日志」「开销记账」「学习记录」）

---

## 可复用练习素材

| 练习 | 用哪个项目 | 启动命令 |
|------|----------|---------|
| 纯 PG SQL | `examples/pgsql-test/` | `psql -U fri -d hello_pg` |
| NestJS + PG CRUD | `examples/typeorm-pg-crud/` | `cd examples/typeorm-pg-crud && pnpm start:dev` |
| NestJS 纯概念（无 DB） | `examples/nest-feature/` | `cd examples/nest-feature && pnpm start:dev` |
| 学习笔记查询 | `docs/agents/fullstack/database/postgresql.md` | 直接打开阅读 |
| NestJS 笔记 | `drafts/nest-langchain/` | 直接打开阅读 |

---

*昇哥 · 2026年7月*
