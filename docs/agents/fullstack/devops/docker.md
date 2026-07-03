# Docker

Docker 将应用及其依赖环境统一封装为镜像，运行后成为容器。容器间相互隔离，互不干扰。

## 为什么需要 Docker

```
一台服务器
├── 容器 1：NestJS 应用（Node 24, port 3000）
├── 容器 2：MySQL（port 3306）
├── 容器 3：Redis（port 6379）
└── 容器 4：Milvus（port 19530）
```

不装 Docker 的话，Node/MySQL/Redis 的依赖混在一起，冲突不断。

## 三个核心概念

| 概念 | 是什么 | 前端类比 |
|------|--------|---------|
| 镜像（Image） | 应用+环境的快照 | node_modules + 系统依赖的 tar 包 |
| 容器（Container） | 镜像的运行实例 | 从 tar 包解压后跑的进程 |
| Dockerfile | 镜像的构建配方 | package.json + webpack.config |

## docker run

```bash
docker run -d --name mysql -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=admin \
  -v /data/mysql:/var/lib/mysql \
  mysql:latest
```

| 参数 | 含义 |
|------|------|
| `-d` | 后台运行 |
| `--name` | 容器名 |
| `-p 3306:3306` | 宿主机端口:容器端口 |
| `-e` | 环境变量 |
| `-v` | 数据卷挂载（宿主机目录:容器目录，数据持久化） |

## Dockerfile

把 NestJS 项目打包成镜像：

```dockerfile
FROM node:24-alpine          # 基础镜像
WORKDIR /app                 # 工作目录
COPY package*.json ./        # 先复制依赖清单（缓存加速）
RUN npm install
COPY . .                     # 复制源码
RUN npm run build            # 编译
EXPOSE 3000                  # 声明端口
CMD ["node", "dist/main.js"] # 启动命令
```

| 指令 | 做什么 | 时机 |
|------|--------|------|
| `FROM` | 指定基础镜像 | 构建时 |
| `WORKDIR` | 工作目录 | 构建时 |
| `COPY` | 复制文件 | 构建时 |
| `RUN` | 执行命令 | 构建时 |
| `EXPOSE` | 声明端口 | 构建时 |
| `CMD` | 启动命令 | 运行时 |

## 分层缓存

Dockerfile 每条指令生成一层。改了代码但没改 package.json → `RUN npm install` 层命中缓存跳过，只重建最后的 `COPY/RUN` 层。

指令顺序的设计哲学：**不容易变的放前面，容易变的放后面。**

## Docker Compose

用 `docker-compose.yml` 描述所有服务，一条命令全起：

```yaml
services:
  mysql:
    image: mysql:latest
    ports: ["3306:3306"]
    environment:
      MYSQL_ROOT_PASSWORD: admin
      MYSQL_DATABASE: book
    volumes:
      - ./volumes/mysql:/var/lib/mysql
```

```bash
docker compose up -d        # 启动
docker compose down         # 停止
docker compose up -d --build # 重新构建+启动
```

所有容器默认处于同一内网，容器名就是域名——Nest 连 MySQL 写 `host: "mysql"` 就行。

---

# 进阶

## 多阶段构建

单阶段构建后镜像里包含 `node_modules`（含 devDeps）、TypeScript 源码——不是运行时需要的。多阶段构建拆成两阶段，最终镜像只保留生产依赖和编译产物：

```dockerfile
# 阶段 1：构建
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install                    # 含 devDeps
COPY . .
RUN npm run build                  # → dist/

# 阶段 2：运行
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --production       # 只装生产依赖
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

镜像体积减少约 400MB。

## 开发 vs 生产

| | 开发 | 生产 |
|----|------|------|
| 目标 | 快，随时改 | 稳定，不能挂 |
| 代码来源 | 本地 hot reload | 镜像构建产物 |
| 数据库 | MySQL + Milvus 全套 | 各服务独立部署 |
| 重启策略 | — | `restart: always` |
| 数据卷 | `volumes/mysql` | `volumes/mysql-prod`（隔离） |

### 开发 compose

只编排基础设施，Nest 应用在本地 `npm run start:dev`：

```yaml
services:
  mysql:
    image: mysql:latest
    ports: ["3306:3306"]
    volumes:
      - ${DOCKER_VOLUME_DIRECTORY:-.}/volumes/mysql:/var/lib/mysql
```

`${DOCKER_VOLUME_DIRECTORY:-.}` 支持环境变量覆盖默认路径。

### 生产 compose

```yaml
services:
  nest-app:
    build:                     # 从 Dockerfile 构建
      context: .
      dockerfile: Dockerfile
    ports: ["3000:3000"]
    depends_on: [mysql-prod]
    restart: always
```

## 分层缓存实战

```bash
# 第一次 build：全量 700MB
docker build -t nest-app .

# 改一行代码，再 build：
# COPY package*.json → CACHED
# RUN npm install      → CACHED
# COPY . .             → NEW（源码变了）
# RUN npm run build     → NEW
# 只重传 0.4MB
```

分层缓存省的不是存储，是**传输和构建时间**。

## 容器间网络

同一 compose 下，容器名就是 DNS：

```js
// Nest 连 MySQL — 本地开发
host: "localhost"

// Nest 连 MySQL — 容器内
host: "mysql"        // ← Docker 自动解析到 MySQL 容器 IP
```

## 常用命令

```bash
docker ps                   # 运行中的容器
docker logs <name>          # 容器日志
docker exec -it <name> sh   # 进入容器
docker system prune -a      # 清理未使用镜像/容器
docker compose -f dev.yml up -d   # 指定文件启动
docker compose -f dev.yml down    # 停止并删除
```

## 踩坑

| 问题 | 修复 |
|------|------|
| `port already allocated` | 改外部端口映射，如 `9010:9000` |
| 容器里连不上宿主机 localhost | 容器里 `localhost` 指自己，用 `host.docker.internal` 或容器名 |
| Attu 连不上 Milvus | Attu 在 Docker 里时地址写容器名 `milvus-standalone:19530` |
| 数据卷 volume 丢失 | 容器删了数据还在 volume 里，不要 `docker compose down -v` |

---

## 参考资源

- [Docker 官方文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [Docker Hub](https://hub.docker.com/)

