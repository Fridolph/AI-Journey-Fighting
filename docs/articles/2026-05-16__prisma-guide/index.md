---
title: 【全栈】02 Prisma ORM 入门——用 TypeScript 的方式管理数据库
published: 2026-05-06
tags: [Prisma, ORM, PostgreSQL, TypeScript, NestJS, 全栈]
category: 全栈
---

> 还在手写 SQL 字符串？还在担心"字段名写错了但 TypeScript 不知道"？Prisma 让你用 TypeScript 的类型安全方式操作数据库。本文以 Card Learning Demo 为实例，从 Schema 设计到 CRUD 操作，完整走一遍 Prisma 开发流程。

---

## 一、什么是 ORM，为什么要用 Prisma

### 1.1 ORM 是什么

ORM（Object-Relational Mapping，对象关系映射）解决的是一个很具体的问题：

**数据库里的"表和行"，和代码里的"类和对象"，是两种不同的世界。**

没有 ORM 的时候，你要手动在这两个世界之间来回翻译：

```typescript
// 手写 SQL 的痛苦
const rows = await db.query(
  `SELECT * FROM cards WHERE status = $1 AND difficulty = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
  ['todo', 'basic', 10, 0]
)
// rows 是 any[]，字段名写错了？TypeScript 不知道
// SQL 字符串拼错了？运行时才报错
// 字段改名了？全局搜索字符串替换，漏掉一处就是 bug
```

ORM 把这个翻译过程自动化了：

```typescript
// Prisma 的方式
const cards = await prisma.card.findMany({
  where: { status: 'todo', difficulty: 'basic' },
  orderBy: { createdAt: 'desc' },
  take: 10, skip: 0,
})
// cards 是 Card[]，类型完整，字段名写错编译就报错
```

**ORM 的核心价值：**
- **类型安全**：字段名、字段类型，编译时就能检查
- **自动补全**：IDE 知道 `card` 有哪些字段，不用查文档
- **迁移管理**：Schema 变更有版本记录，不用手动维护 SQL 文件

**ORM 的代价：**
- 复杂查询（多表 JOIN、窗口函数）有时不如手写 SQL 直观
- 有学习成本，需要理解 ORM 的查询 API
- 生成的 SQL 不一定是最优的（需要 EXPLAIN 验证）

这是取舍，不是银弹。对于大多数业务 CRUD，ORM 的收益远大于代价。

### 1.2 为什么选 Prisma，而不是 TypeORM

Node.js 生态里最常见的两个 ORM 是 TypeORM 和 Prisma。我学的时候也纠结过，后来选了 Prisma，原因是：

| 对比维度 | 手写 SQL | TypeORM | Prisma |
|---|---|---|---|
| 类型安全 | ❌ 字符串拼错编译不报错 | ⚠️ 装饰器复杂，类型推导不完整 | ✅ 自动生成完整类型 |
| Schema 管理 | 手动维护 SQL 文件 | 自动/手动混用，容易混乱 | `prisma migrate dev` 一条命令 |
| 学习曲线 | 低入门但容易出错 | 中高，装饰器 + 实体类 + Repository 三层 | **低**，Schema 文件直观易读 |
| IDE 支持 | 无 | 一般 | **自动补全 + 类型提示** |
| 迁移文件 | 手写 | 自动生成但可读性差 | 自动生成，SQL 可读，可手动修改 |

TypeORM 的问题不是"不好"，而是**装饰器写法在复杂场景下类型推导容易失真**——你以为有类型保护，实际上 `any` 悄悄溜进来了。Prisma 的设计哲学不同：**Schema 文件是唯一的事实源**，所有类型从 Schema 自动生成，没有歧义。

Prisma 另一个我很喜欢的设计：**Schema 文件即文档**。新人接手项目，打开 `schema.prisma`，所有表结构、字段类型、关系一目了然——不用去数据库里反向查，也不用翻散落在各处的实体类文件。

---

## 二、环境搭建

### 2.1 安装

```bash
pnpm add prisma @prisma/client
pnpm add @prisma/adapter-pg   # PG 驱动
```

### 2.2 初始化

```bash
npx prisma init
```

生成 `prisma/schema.prisma` 和 `.env` 中的 `DATABASE_URL`。

### 2.3 用 Docker 启动 PostgreSQL

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:17-alpine
    ports: ['15432:5432']
    environment:
      POSTGRES_USER: journey
      POSTGRES_PASSWORD: journey123
      POSTGRES_DB: ai_journey_lab
```

```bash
docker compose up -d
```

### 2.4 配置连接

```env
# .env
DATABASE_URL=postgresql://journey:journey123@localhost:15432/ai_journey_lab
```

---

## 三、Schema 设计：用代码描述数据库

### 3.1 基础模型

```prisma
model Card {
  id         String   @id @default(uuid())
  title      String
  content    String
  summary    String?
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@map("cards")
}
```

| 语法 | 含义 |
|---|---|
| `@id` | 主键 |
| `@default(uuid())` | 默认生成 UUID |
| `@default(now())` | 默认取当前时间 |
| `@updatedAt` | 每次更新自动刷新时间 |
| `String?` | 可为空字段 |
| `@map("created_at")` | Prisma 字段名 → 数据库列名映射 |
| `@@map("cards")` | Prisma 模型名 → 数据库表名映射 |

### 3.2 Prisma Enum

```prisma
enum CardStatus {
  todo
  doing
  done
}

enum CardDifficulty {
  basic
  medium
  advanced
}

model Card {
  difficulty CardDifficulty @default(basic)
  status     CardStatus     @default(todo)
}
```

Enum 的好处：数据库层面约束合法值，TypeScript 编译时检查——不会出现 `status = 'invalid'` 这种运行时才爆的错误。

### 3.3 多对多关系：Card ↔ Tag

Card 和 Tag 是多对多关系（一张卡片多个标签，一个标签多张卡片），需要中间表：

```prisma
model Tag {
  id   String @id @default(uuid())
  name String @unique
  @@map("tags")
}

model CardTag {
  cardId String
  tagId  String
  card Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
  tag  Tag  @relation(fields: [tagId],  references: [id], onDelete: Cascade)
  @@id([cardId, tagId])
  @@map("card_tags")
}
```

**关键概念**：
- `@relation(fields: [cardId], references: [id])` — cardId 是外键，指向 Card.id
- `@@id([cardId, tagId])` — 联合主键，防止重复关联
- `onDelete: Cascade` — 删除 Card 时自动删除关联的 CardTag 记录

### 3.4 一对多关系：Card → LearningRecord

```prisma
model LearningRecord {
  id     String  @id @default(uuid())
  cardId String  @map("card_id")
  action String
  note   String?

  card Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
  @@map("learning_records")
}
```

一对多不需要中间表——在"多"的一方（LearningRecord）放外键 `card_id` 即可。

### 3.5 生成数据库

```bash
npx prisma migrate dev --name init
```

Prisma 自动生成迁移 SQL 并执行。`prisma/migrations/` 目录下可以看到每一步的 SQL 文件：

```sql
-- prisma/migrations/.../migration.sql
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);
```

迁移文件是纯 SQL，可读、可审查、可手动修改——这点比 TypeORM 自动生成的迁移文件友好很多。

---

## 四、Prisma Studio：内置 GUI

```bash
npx prisma studio
```

浏览器打开 `http://localhost:5555`，可以：

- 浏览所有表的数据（表格视图）
- 直接新增 / 编辑 / 删除记录
- 查看表之间的关系

这是 **Prisma 内置的 GUI 工具**，相当于一个轻量版的 pgAdmin，适合开发阶段快速查看和修改数据。我通常用它来验证 Service 层写完之后数据是否正确写进去了——比 `console.log` 直观多了。

---

## 五、NestJS 集成：PrismaService

### 5.1 PrismaService 封装

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
    super({ adapter })
  }

  async onModuleInit()    { await this.$connect() }
  async onModuleDestroy() { await this.$disconnect() }
}
```

关键点：
- `extends PrismaClient` — 继承 Prisma 客户端，获得所有 model 方法
- `onModuleInit` — NestJS 启动时自动连接数据库
- `onModuleDestroy` — NestJS 关闭时自动断开连接
- 模块加上 `@Global()` → 任何 Service 都能注入，不用每个模块都 imports

### 5.2 CardsService CRUD

```typescript
@Injectable()
export class CardsService {
  constructor(private readonly prisma: PrismaService) {}

  // 分页列表 + 关键词搜索 + 动态排序
  async findAll(query: QueryCardsDto) {
    const where: Prisma.CardWhereInput = {}

    if (query.keyword) {
      where.OR = [
        { title:   { contains: query.keyword, mode: 'insensitive' } },
        { summary: { contains: query.keyword, mode: 'insensitive' } },
        { content: { contains: query.keyword, mode: 'insensitive' } },
      ]
    }
    if (query.status)     where.status     = query.status
    if (query.difficulty) where.difficulty = query.difficulty

    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } satisfies Prisma.CardOrderByWithRelationInput

    const [items, total] = await this.prisma.$transaction([
      this.prisma.card.findMany({ where, skip, take, orderBy }),
      this.prisma.card.count({ where }),
    ])

    return { items, meta: { page, pageSize, total } }
  }

  // 单条查询
  async findOne(id: string) {
    const card = await this.prisma.card.findUnique({ where: { id } })
    if (!card) throw new NotFoundException('卡片不存在')
    return card
  }

  // 创建
  async create(dto: CreateCardDto) {
    return this.prisma.card.create({
      data: {
        title:      dto.title,
        content:    dto.content || '',
        difficulty: dto.difficulty,
        status:     dto.status,
      }
    })
  }

  // 更新
  async update(id: string, dto: UpdateCardDto) {
    await this.findOne(id)  // 先确认存在，不存在抛 404
    return this.prisma.card.update({ where: { id }, data: dto })
  }

  // 删除
  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.card.delete({ where: { id } })
  }
}
```

---

## 六、Seeding：初始化数据

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const demos = [
    { id: 'prompt-template-weekly-report', title: '角色驱动 · 智能报告' },
    { id: 'chat',                          title: '多轮对话 · AI 助手'  },
  ]

  for (const demo of demos) {
    await prisma.demo.upsert({
      where:  { id: demo.id },
      update: demo,
      create: demo,
    })
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
```

`upsert` = update + insert：有则更新，无则创建。seed 脚本的标配——重复执行不会报错，也不会产生重复数据。

执行：`npx prisma db seed`

---

## 七、Prisma + Zod：为什么不用 class-validator

这是我在学 NestJS 时纠结过的一个问题。NestJS 官方文档推荐的是 `class-validator` + `class-transformer`，但我最后选了 Zod。

### 7.1 class-validator 的问题

```typescript
// class-validator 的写法
import { IsString, IsEnum, MinLength, IsOptional } from 'class-validator'

export class CreateCardDto {
  @IsString()
  @MinLength(1)
  title: string

  @IsEnum(CardDifficulty)
  @IsOptional()
  difficulty?: CardDifficulty
}
```

看起来没问题，但有几个坑：

**坑 1：装饰器不是类型系统的一部分**

`@IsString()` 只在运行时校验，TypeScript 编译时不知道它的存在。如果请求里没传 `title`，运行时就是 `undefined`——编译不报错，运行才爆。

**坑 2：需要 `class-transformer` 配合，增加复杂度**

`class-validator` 只校验，不转换。要把 JSON 请求体转成类实例，还需要 `class-transformer` 的 `plainToInstance`。两个库配合，配置项多，容易出错。

**坑 3：类型推导不完整**

```typescript
// ❌ class-validator：字段声明是 string，但实际可能是 undefined
const dto = plainToInstance(CreateCardDto, body)
dto.title  // TypeScript 认为是 string，实际可能是 undefined
```

### 7.2 Zod 的优势

```typescript
// Zod 的写法
import { z } from 'zod'

export const createCardSchema = z.object({
  title:      z.string().trim().min(1, '标题不能为空'),
  difficulty: z.enum(['basic', 'medium', 'advanced']).default('basic'),
  status:     z.enum(['todo', 'doing', 'done']).default('todo'),
  content:    z.string().optional().default(''),
}).strict()

export type CreateCardDto = z.infer<typeof createCardSchema>
```

**优势 1：类型从 Schema 自动推导，没有歧义**

`z.infer<typeof createCardSchema>` 生成的类型是精确的——`parse` 成功之后，返回值的每个字段都有正确的类型，不会有 `undefined` 漏网。

**优势 2：parse 即校验 + 转换，一步到位**

```typescript
const dto = createCardSchema.parse(body)
// dto 是完整的 CreateCardDto 类型，已经过校验和转换
// 如果校验失败，直接抛 ZodError，不需要额外配置
```

**优势 3：和 Prisma 的设计哲学一致**

Prisma：Schema 文件 → 自动生成类型
Zod：Schema 对象 → 自动推导类型

两者都是"**Schema 即类型**"的思路，组合起来非常自然：

```typescript
// 请求校验（Zod）
const createCardSchema = z.object({
  title:      z.string().trim().min(1),
  difficulty: z.enum(['basic', 'medium', 'advanced']).default('basic'),
}).strict()

// 数据库层（Prisma Schema）
// enum CardDifficulty { basic medium advanced }
// model Card { difficulty CardDifficulty @default(basic) }
```

请求进来 → Zod 拦截非法值（返回 400）→ Prisma 写入合法数据 → PG enum 再拦一层。三层防护，每层职责清晰。

### 7.3 什么时候还是用 class-validator

如果项目已经大量使用 `class-validator`，或者团队对它更熟悉，没必要强行换。Zod 的优势在**新项目**和**TypeScript 优先**的场景下更明显。

---

## 八、常用 Prisma 操作速查

| 操作 | Prisma API | 说明 |
|---|---|---|
| 列表 | `findMany({ where, skip, take, orderBy })` | 分页查询 |
| 单条 | `findUnique({ where: { id } })` | 主键查询 |
| 创建 | `create({ data })` | 插入 |
| 更新 | `update({ where, data })` | 部分更新 |
| 删除 | `delete({ where })` | 删除 |
| 统计 | `count({ where })` | 行数 |
| 创建或更新 | `upsert({ where, create, update })` | seed 常用 |
| 事务 | `$transaction([...])` | 批量执行 |
| 模糊搜索 | `{ contains: 'kw', mode: 'insensitive' }` | ILIKE |
| 动态排序 | `{ [sortBy]: sortOrder } satisfies Prisma.XxxOrderByInput` | 类型安全动态排序 |

---

## 九、GUI 开发工作流

推荐的开发节奏：

```text
1. 写 schema.prisma         → 描述数据模型
2. prisma migrate dev       → 生成 SQL + 建表
3. prisma studio            → GUI 查看表结构
4. 写 Service 层 CRUD 逻辑
5. prisma studio / pgAdmin  → 验证数据是否正确写入
```

Prisma Studio + pgAdmin 双 GUI 组合：Studio 快速 CRUD 浏览，pgAdmin 深度分析（执行计划、索引、连接监控）。两个工具各有侧重，开发阶段都用得上。

---

## 写在最后

Prisma 的核心价值不是"让你不写 SQL"，而是**让你用类型安全的方式操作数据库**。

Schema 文件是唯一的事实源——它同时是文档、迁移源、类型生成器。配合 Zod 做请求校验，整条链路从请求到数据库都有类型保护，写起来很踏实。

这是我在 Card Learning Demo 里实际用下来的感受，不一定是最优解，但目前对我来说是最顺手的一套。

下一篇介绍 **Card Learning Demo 全栈项目实战**——从设计到 CRUD 接口的完整实现：[Card Learning Demo——一个全栈数据库学习项目](/articles/2026-05-19__card-demo/)。

---

*昇哥 · 2026年5月*
*学 Prisma + NestJS 途中，顺手把想清楚的事写下来。*
