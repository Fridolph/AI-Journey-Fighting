# Docker Compose：本地开发提效与生产环境部署

> 示例代码：`examples/nest-dockerfile-test/`

## 为什么需要 Docker

数据库、中间件、业务代码都跑在同一台机器上，但依赖环境各不相同（Node 版本、Python、系统库），装在一起互相污染。

Docker 将应用及其环境**统一封装为镜像**——镜像运行后成为**容器**，容器之间隔离，拥有独立的文件系统、网络和端口。

```
一台服务器
├── 容器 1：NestJS 应用（Node 24, port 3000）
├── 容器 2：MySQL（port 3306）
├── 容器 3：Redis（port 6379）
└── 容器 4：Milvus（port 19530）
```

## 三个核心概念

| 概念 | 是什么 | 前端类比 |
|------|--------|---------|
| **镜像（Image）** | 应用 + 环境的快照 | `node_modules` + 系统依赖的 tar 包 |
| **容器（Container）** | 镜像的运行实例 | tar 包解压后跑的进程 |
| **Dockerfile** | 镜像的"构建配方" | `package.json` + `webpack.config` |

## Dockerfile 多阶段构建

**问题**：单阶段构建后镜像包含 `node_modules`（含 devDependencies）、TypeScript 源码——不是运行时需要的。

**解决**：

```dockerfile
# ═══ 阶段 1：构建 ═══
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build           # → 产出 dist/

# ═══ 阶段 2：运行 ═══
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --production  # ← 只装生产依赖
COPY --from=builder /app/dist ./dist  # ← 从阶段 1 复制编译产物
CMD ["node", "dist/main.js"]
```

**效果**：最终镜像只有生产依赖 + `dist/`，少了源码和 devDeps，体积减 ~400MB。

## 分层缓存：为什么改了代码不重传 700MB

Docker 镜像按 Dockerfile 指令**分层存储**：

```
FROM node:24-alpine              ← 层 1：系统基础（168MB，极少变）
COPY package*.json               ← 层 2：依赖清单（12KB，加包时才变）
RUN npm install --production     ← 层 3：node_modules（407MB，加包时才变）
COPY --from=builder /app/dist    ← 层 4：编译产物（0.4MB，每次改代码都变）
```

Docker 按层对比 hash——改业务代码只重建层 4，push/pull 时只传 0.4MB。

> **设计哲学**：不容易变的放前面，容易变的放后面。

## Docker Compose：一键编排多容器

### 开发环境

只编排基础设施（MySQL + Milvus etc），Nest 应用在本地跑——支持热重载：

```yaml
services:
  mysql:
    image: mysql:latest
    ports: ["3306:3306"]
    environment:
      MYSQL_ROOT_PASSWORD: admin
      MYSQL_DATABASE: book
    volumes:
      - ${DOCKER_VOLUME_DIRECTORY:-.}/volumes/mysql:/var/lib/mysql
```

### 生产环境

与开发三个关键区别：

| | 开发 | 生产 |
|---|---|---|
| Nest 代码来源 | 本地 `npm run start:dev` | Dockerfile 构建 → 容器 |
| MySQL 连接 | `host: "localhost"` | `host: "mysql-prod"`（容器名即域名） |
| 数据卷 | `volumes/mysql` | `volumes/mysql-prod`（隔离） |
| 重启策略 | 不重要 | `restart: always` |

> **Docker Compose 自动做 DNS**：服务名 = 域名。Nest 连 MySQL 写 `host: "mysql-prod"` 就能通。

## 常用命令

```bash
# 构建镜像
docker build -t nest-app .

# 运行容器
docker run -d --name nest-container -p 3006:3000 nest-app

# Compose 启动开发环境
docker compose -f docker-compose.dev.yml up -d

# Compose 启动生产环境
docker compose -f docker-compose.prod.yml up -d --build

# 停止并删除
docker compose -f docker-compose.dev.yml down
```

## 核心收获

- **数据库是根，中间件是特种兵**——MySQL 存核心数据，Redis/ES/Milvus 解决缓存、搜索、语义检索
- **多阶段构建 + 分层缓存** 是两套独立机制：一个省体积，一个省时间，改代码重 build 时一起起作用
- **开发 vs 生产的区别不是技术，是思维**——开发求快、生产求稳，compose 文件分开管理
