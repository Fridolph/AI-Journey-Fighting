# pgsql-test — 学习记录

PostgreSQL + pgvector（AI 时代数据库）学习专题。

## 学习文件清单

| # | 文件 | 状态 | 日期 |
|---|------|------|------|
| 01 | [PostgreSQL：AI 时代的关系型数据库](./01-postgresql-ai-era) | ✅ 完成 | 2026-08-05 |

## 示例代码

| 项目 | 方式 | 说明 |
|------|------|------|
| `examples/pgsql-test/` | 纯 pg 驱动 | SQL 手写 CRUD + pgvector 语义检索 |
| `examples/typeorm-pg-crud/` | TypeORM + NestJS | ORM 一对多关联查询 + 原生 SQL 语义检索 |

## 环境说明

- PostgreSQL 16 + pgvector 扩展，Docker 运行（容器名 `pg_vector_db`）
- pgAdmin 管理界面：`http://localhost:8088`（邮箱 `249121486@qq.com` / 密码 `admin`）
- 数据库：`hello_pg`（用户 `user` / 密码 `123456`）
- 注意：`docker-compose.yml` 默认账号是 `admin/learn_pg`，`.env.example` 是 `user/hello_pg`，学习时需保持连接串一致

## 维护记录

| 日期 | 变更 |
|------|------|
| 2026-08-05 | 新增 PostgreSQL AI 时代数据库学习笔记，跑通两个项目 |
