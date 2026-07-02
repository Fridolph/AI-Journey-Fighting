# Docker Compose

## 一句话

**用一个 YAML 文件描述所有服务及其关系，一条命令全部启动。**

## 核心直觉

```
单独启动：
docker run mysql ...      # 一条命令
docker run redis ...      # 又一条
docker run milvus ...     # Milvus 还要先起 etcd + minio，三条命令

Docker Compose（docker-compose.yml）：
docker compose up -d       # 一条命令，全部起来
```

## 为什么需要

一个完整的 AI 全栈项目通常涉及：MySQL + Redis + Milvus（含 etcd + minio）+ ES + NestJS 应用。手动一个一个起，忘记顺序就报错。Docker Compose 把它们的关系写成一个 YAML 文件，声明式的——你描述「要什么」，它自动处理启动顺序和网络。

## 开发 vs 生产

| | 开发环境 | 生产环境 |
|---|---|---|
| 应用代码来源 | 本地 `npm run dev`（hot reload） | `build: Dockerfile` 从 Dockerfile 构建镜像 |
| 数据库连接 | `host: localhost` | `host: 容器名`（Docker DNS 自动解析） |
| 数据持久化 | `./volumes/mysql` | 独立的数据卷或云存储 |
| 重启策略 | 无所谓 | `restart: always` |
| Compose 文件 | `docker-compose.dev.yml` | `docker-compose.prod.yml` |

## 关键概念：容器名就是域名

```yaml
services:
  mysql:
    ...
  nest-app:
    environment:
      DB_HOST: mysql    # ← 不是 localhost！是服务名
```

Docker Compose 自动创建内网 DNS——服务名 = 可解析的域名。

## 小结

Docker Compose 是后端服务的「启动脚本」。你不需要记住每个容器的参数——写在 YAML 里一次，之后 `docker compose up` 就行。这是前端转全栈的必备技能。

## 下一步

- [Docker](./docker.md) — 容器化基础
- [多阶段构建](./multi-stage-build.md) — 优化生产镜像
