---
title: 【全栈】03 Card Learning Demo——一个全栈数据库学习项目的设计与实现
published: 2026-05-19
tags: [全栈, NestJS, Prisma, PostgreSQL, Docker, DTO, Zod, CRUD]
category: 全栈
---

> 从零搭建一个全栈数据库学习项目：Docker 启动 PostgreSQL → Prisma Schema 建模 → NestJS DTO + Zod 校验 → 完整 CRUD 接口 → 分页/筛选/排序。这篇文章记录完整的开发过程。

---

## 一、项目定位

Card Learning Demo 是 AI-Journey-Land 的全栈数据库学习项目，定位为**渐进式知识管理系统**——用"一张知识卡片的一生"串联全部数据库技术栈：

```text
创建 Card → PostgreSQL 持久化 → Redis 缓存 → MongoDB 行为日志
         → Elasticsearch 搜索 → IndexedDB 离线 → AI 能力
```

v0.1 MVP 阶段已完成：PostgreSQL + Prisma + NestJS CRUD + 分页/筛选/排序。

---

## 二、技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 数据库 | PostgreSQL 17 | 主业务数据库，Docker Compose 一键启动 |
| ORM | Prisma 7 | 类型安全、自动 migration、Prisma Studio GUI |
| 后端 | NestJS | Module / Controller / Service 三层 |
| 校验 | Zod + nestjs-zod | 运行时校验 + TypeScript 类型推导 |
| 部署 | Docker Compose | 本地开发环境 |

---

## 三、数据模型设计

```text
cards ──┬── card_tags ──┬── tags         (多对多)
        │
        └── learning_records              (一对多)
```

四张表：

**cards**：卡片主表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| title | String | 标题 |
| content | String | 正文 |
| summary | String? | 摘要 |
| category | String? | 分类 |
| difficulty | CardDifficulty | 枚举：basic / medium / advanced |
| status | CardStatus | 枚举：todo / doing / done |
| created_at | DateTime | 自动生成 |
| updated_at | DateTime | 自动更新 |

**tags**：标签表（name UNIQUE）

**card_tags**：多对多关联表（cardId + tagId 联合主键）

**learning_records**：学习记录（cardId 外键指向 Card）

### Prisma Enum

```prisma
enum CardStatus { todo doing done }
enum CardDifficulty { basic medium advanced }
```

选择 Enum 而非 String 的理由：数据库层面约束合法值，TypeScript 编译时检查。

---

## 四、项目结构

```text
apps/api/src/cards/
├── cards.module.ts          # NestJS 模块声明
├── cards.controller.ts      # REST 路由
├── cards.service.ts         # 业务逻辑
└── dto/
    ├── card.schema.ts       # Zod schema 集中定义
    ├── create-card.dto.ts   # POST 请求校验
    ├── update-card.dto.ts   # PATCH 请求校验
    └── query-cards.dto.ts   # GET 查询参数校验
```

---

## 五、Zod DTO 设计

### 5.1 集中式 Schema 定义

```typescript
// card.schema.ts
export const cardStatusSchema = z.enum(['todo', 'doing', 'done'])
export const cardDifficultySchema = z.enum(['basic', 'medium', 'advanced'])
export const cardSortBySchema = z.enum(['createdAt', 'updatedAt', 'title', 'difficulty', 'status'])
export const sortOrderSchema = z.enum(['asc', 'desc'])
```

枚举集中定义，Create / Update / Query DTO 复用同一份 Schema。

### 5.2 Create DTO

```typescript
export const createCardSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().optional(),
  content: z.string().trim().optional(),
  category: z.string().trim().min(1).optional(),
  difficulty: cardDifficultySchema.default('basic'),
  status: cardStatusSchema.default('todo'),
}).strict()

export class CreateCardDto extends createZodDto(createCardSchema) {}
```

### 5.3 Query DTO（核心亮点）

```typescript
export const queryCardsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  keyword: z.string().trim().min(1).optional(),
  status: cardStatusSchema.optional(),
  difficulty: cardDifficultySchema.optional(),
  category: z.string().trim().min(1).optional(),
  sortBy: cardSortBySchema.default('createdAt'),
  sortOrder: sortOrderSchema.default('desc'),
}).strict()

export class QueryCardsDto extends createZodDto(queryCardsSchema) {}
```

**`z.coerce.number()`** 是关键——URL query string 传参是字符串（`?page=1`），`coerce` 自动转为 number。Service 层不再需要手动 `Number(query.page)`。

### 5.4 Update DTO

```typescript
export const updateCardSchema = z.object({
  title: z.string().trim().min(1).optional(),
  /* ... 所有字段都是 optional ... */
}).strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: '至少需要提供一个要更新的字段',
  })
```

`.refine()` 自定义校验——PATCH `{}` 空对象直接 400。

---

## 六、Controller 路由设计

```typescript
@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get()       findAll(@Query() query: QueryCardsDto) { ... }
  @Get(':id')  findOne(@Param('id') id: string) { ... }
  @Post()      create(@Body() dto: CreateCardDto) { ... }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCardDto) { ... }
  @Delete(':id') remove(@Param('id') id: string) { ... }
}
```

路由表：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/cards?page=1&sortBy=title&status=todo | 分页列表+筛选+排序 |
| GET | /api/cards/:id | 单条详情 |
| POST | /api/cards | 创建 |
| PATCH | /api/cards/:id | 部分更新 |
| DELETE | /api/cards/:id | 删除 |

---

## 七、Service 核心逻辑

### 7.1 完整 findAll

```typescript
async findAll(query: QueryCardsDto) {
  const { page, pageSize } = query
  const skip = (page - 1) * pageSize
  const where: Prisma.CardWhereInput = {}

  // 关键词搜索（三字段 OR）
  if (query.keyword) {
    where.OR = [
      { title: { contains: query.keyword, mode: 'insensitive' } },
      { summary: { contains: query.keyword, mode: 'insensitive' } },
      { content: { contains: query.keyword, mode: 'insensitive' } },
    ]
  }

  // 枚举等值筛选
  if (query.status) where.status = query.status
  if (query.difficulty) where.difficulty = query.difficulty
  if (query.category) where.category = query.category

  // 动态排序
  const orderBy = {
    [query.sortBy]: query.sortOrder,
  } satisfies Prisma.CardOrderByWithRelationInput

  // 并发查询：数据 + 总数
  const [items, total] = await this.prisma.$transaction([
    this.prisma.card.findMany({ where, skip, take: pageSize, orderBy }),
    this.prisma.card.count({ where }),
  ])

  return {
    items,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}
```

### 7.2 逐段拆解

| 功能 | 实现 | Prisma API |
|---|---|---|
| 分页 | `skip = (page-1) * pageSize` | `findMany({ skip, take })` |
| 模糊搜索 | `contains + mode: 'insensitive'` | PostgreSQL ILIKE |
| 等值筛选 | `where.status = query.status` | Prisma enum 直接比较 |
| 动态排序 | `{ [sortBy]: sortOrder }` + `satisfies` | TypeScript 类型安全 |
| 事务 | `$transaction([findMany, count])` | 一次网络往返 |
| 总数 | `.count({ where })` | 分页 total |

### 7.3 CRUD 全貌

```typescript
// 创建
async create(dto: CreateCardDto) {
  return this.prisma.card.create({
    data: {
      title: dto.title,
      content: dto.content || '',
      category: dto.category,
      difficulty: dto.difficulty,
      status: dto.status,
    },
  })
}

// 更新（PATCH 语义：只更新传了的字段）
async update(id: string, dto: UpdateCardDto) {
  await this.findOne(id)  // 404 保护
  return this.prisma.card.update({ where: { id }, data: dto })
}

// 删除
async remove(id: string) {
  await this.findOne(id)  // 404 保护
  return this.prisma.card.delete({ where: { id } })
}
```

**设计要点**：
- `findOne` 先做存在性检查——不存在的 ID 返回 404 而非 Prisma 底层错误
- `update` 只传实际提供了的字段（Prisma 忽略 `undefined`），天然 PATCH 语义
- `content || ''`——数据库列 NOT NULL，DTO 允许缺省

---

## 八、Docker 部署

```yaml
# docker-compose.yml（项目根目录）
services:
  postgres:
    image: postgres:17-alpine
    container_name: ai-journey-pg
    restart: unless-stopped
    ports: ['15432:5432']
    environment:
      POSTGRES_USER: journey
      POSTGRES_PASSWORD: journey123
      POSTGRES_DB: ai_journey_lab
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

```bash
docker compose up -d          # 启动 PG
npx prisma migrate dev        # 建表
npx prisma db seed            # 初始化数据
pnpm dev                      # 启动 NestJS
```

---

## 九、完整数据流（一次 POST /api/cards）

```
前端 Admin 页面
  └─ fetch POST /api/cards  { title: "PG 索引", difficulty: "advanced" }
       └─ NestJS Router → CardsController.create(@Body() dto: CreateCardDto)
            └─ ValidationPipe → createCardSchema.parse(body)
                 ├─ title 非空 ✅
                 ├─ difficulty = "advanced" ✅ (z.enum)
                 └─ status = "todo" (z.default)
            └─ CardsService.create(dto)
                 └─ prisma.card.create({ data: { title, content, ... } })
                      └─ PrismaClient → pg driver → PostgreSQL
                           INSERT INTO cards (...) VALUES (...)
            └─ ResponseInterceptor → { code: 200, data: { id, title, ... } }
  └─ 前端拿到 { id, title, difficulty: "advanced", status: "todo", ... }
```

---

## 十、开发过程中踩到的关键决策

| 决策 | 选型 | 理由 |
|---|---|---|
| DTO 方案 | Zod + nestjs-zod | 运行时校验 + 类型推导，比 class-validator 更简洁 |
| 枚举 | Prisma Enum | 数据库层约束 + TS 类型安全，优于 `String` |
| 排序 | 动态 `{ [sortBy]: sortOrder }` + `satisfies` | 支持任意字段排序，satisfies 保证类型检查 |
| 分页 | skip/take | Prisma 原生支持，简单直接 |
| 搜索 | `contains + insensitive` | PostgreSQL ILIKE，不区分大小写 |
| 404 保护 | Service 层手动 `findOne` | 比 Prisma 原生错误信息更友好 |
| 模糊搜索 | 三字段 OR | title/summary/content 同时搜 |

---

## 十一、后续版本路线

| 版本 | 新增 | 学习点 |
|---|---|---|
| v0.1 ✅ | PostgreSQL + Prisma CRUD | 分页/筛选/排序/枚举 |
| v0.2 | 索引与查询优化 | EXPLAIN / 复合索引 |
| v0.3 | 事务与并发 | 乐观锁 / 隔离级别 |
| v0.4 | Redis 缓存 | Cache Aside |
| v0.5 | MongoDB 日志 | 文档模型 |
| v0.6 | Elasticsearch 搜索 | 倒排索引 |
| v0.7 | IndexedDB 离线 | 离线优先 |
| v0.8 | AI 能力 | RAG / 摘要 / 测验 |

---

## 写在最后

Card Learning Demo 是一个"麻雀虽小五脏俱全"的全栈项目。从 Docker 启动数据库 → Prisma 建模 → Zod DTO 校验 → NestJS CRUD → 分页/筛选/排序，每一步都有明确的工程决策和代码落地。

它不是"一次性写完就丢"的 Demo——它设计成**渐进式**的：每个版本只加一个新技术，逐步深入。这也是 AI-Journey-Land 平台一贯的理念：**每个 Demo 都保留来源上下文，并按独立 feature 边界沉淀接口、页面和运行契约**。

项目地址：[AI-Journey-Land](https://github.com/Fridolph/AI-Journey-Land)，欢迎 star ⭐
