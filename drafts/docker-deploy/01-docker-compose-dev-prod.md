# Docker Compose 本地开发提效与生产环境部署

> 学习日期：2026-05-24
> 示例代码：`examples/nest-dockerfile-test/`

---

## 一、学习目标

- 理解数据库 vs 中间件的职责划分
- 掌握 Docker 核心三要素：镜像、容器、Dockerfile
- 能从 `docker run` 命令行倒推出 Docker Desktop 界面上的每个参数
- 看懂单阶段 vs 多阶段构建的区别
- 用 Docker Compose 一键编排开发/生产环境

---

## 二、数据库是根，中间件是特种兵

### 2.1 一幅图理清三层关系

```
┌─────────────────────────────────────────┐
│              业务代码（NestJS）           │  ← 指挥官
│         调度所有底层组件，实现业务功能     │
├─────────────────────────────────────────┤
│  中间件（各怀绝技的特种兵）                │
│  Redis    → 高速缓存（补 MySQL 磁盘慢）    │
│  ES       → 全文检索（补 MySQL 模糊搜索弱）│
│  Milvus   → 语义向量检索                  │
│  BullMQ   → 消息队列（异步任务缓冲）       │
├─────────────────────────────────────────┤
│  数据库（业务的压舱石）                    │  ← 根，不能丢
│  MySQL    → 业务原始数据，持久化存储       │
│  PostgreSQL → 同上，支持向量扩展           │
└─────────────────────────────────────────┘
```

### 2.2 核心区别

| 维度 | 数据库 | 中间件 |
|------|--------|--------|
| 核心职责 | 持久化，存业务资产 | 专项能力补足 |
| 数据丢了？ | 不能丢，是根 | 丢了不影响数据完整性 |
| 比喻 | 全能但笨重的仓库 | 各怀绝技的特种兵 |
| 典型 | MySQL, PostgreSQL | Redis, ES, Milvus, BullMQ |

**你写的业务代码就是"指挥官"**——懂业务逻辑是及格，能精准调度这些中间件解决性能、并发、搜索痛点，才是真正的后端能力。

---

## 三、Docker 为什么需要

### 3.1 问题

数据库、中间件、业务代码都跑在同一台机器上，但它们的依赖不同（Node 版本、Python 版本、系统库）。装在一起会互相污染。

### 3.2 解决

Docker 将应用及其依赖环境**统一封装为镜像**。镜像运行后成为**容器**。容器之间相互隔离，拥有独立的文件系统、网络、端口。

```
一台服务器
├── 容器 1：NestJS 应用（Node 24, port 3000）
├── 容器 2：MySQL（port 3306）
├── 容器 3：Redis（port 6379）
└── 容器 4：Milvus（port 19530）
```

### 3.3 三个核心概念

| 概念 | 是什么 | 前端类比 |
|------|--------|---------|
| **镜像（Image）** | 应用 + 环境的快照 | `node_modules` + 系统依赖的 tar 包 |
| **容器（Container）** | 镜像的运行实例 | 从 tar 包解压后跑的进程 |
| **Dockerfile** | 镜像的"构建配方" | `package.json` + `webpack.config` |

---

## 四、从 Docker Desktop 倒推出 `docker run`

Docker Desktop 界面上填的参数本质上是一行命令：

```bash
docker run -d \
  --name mysql-container \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=admin \
  -v /Users/guang/mysql:/var/lib/mysql \
  mysql:latest
```

| 参数 | 含义 | Docker Desktop 对应 |
|------|------|-------------------|
| `-d` | 后台运行（daemon） | — |
| `--name` | 容器名字 | Container Name |
| `-p 3306:3306` | 宿主机端口:容器端口 | Ports |
| `-e KEY=VALUE` | 环境变量 | Environment Variables |
| `-v /host/path:/container/path` | 数据卷挂载 | Volumes |
| `mysql:latest` | 镜像名:版本 | Image |

### 数据卷 volume 的作用

```bash
-v /宿主机目录:/容器内目录
```

**容器删了数据不会丢。** 比如 MySQL 容器挂了，重新启动一个，挂载同一个宿主目录，数据就回来了。

---

## 五、Dockerfile：从源码到镜像

### 5.1 单阶段构建（Dockerfile2）

```dockerfile
FROM node:24.15-alpine          # ① 基础镜像（必须第一行）
WORKDIR /app                     # ② 工作目录
COPY package*.json ./            # ③ 先复制 package.json（缓存加速）
RUN npm install                  # ④ 安装依赖
RUN npm install -g @nestjs/cli
COPY . .                         # ⑤ 复制源代码
RUN npm run build                # ⑥ 编译
EXPOSE 3000                      # ⑦ 声明端口（仅声明，不实际映射）
CMD ["node", "dist/main.js"]     # ⑧ 启动命令
```

### 5.2 指令速查

| 指令 | 做什么 | 时机 |
|------|--------|------|
| `FROM` | 指定基础镜像 | 构建时 |
| `WORKDIR` | 设置工作目录 | 构建时 |
| `COPY` | 宿主文件 → 容器 | 构建时 |
| `RUN` | 执行命令（如 `npm install`） | 构建时 |
| `EXPOSE` | 声明端口（文档作用） | 构建时 |
| `CMD` | 容器启动时执行的默认命令 | 运行时 |

### 5.3 多阶段构建（Dockerfile）

**问题**：单阶段构建后镜像里包含 `node_modules`（含 devDependencies）、TypeScript 源码——这些不是运行时需要的，白占空间。

**解决**：

```dockerfile
# ═══ 阶段 1：构建阶段 ═══
FROM node:24.15-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install                    # ← 含 @nestjs/cli、typescript
COPY . .
RUN npm run build                  # ← 产出 dist/

# ═══ 阶段 2：运行阶段 ═══
FROM node:24.15-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --production       # ← 只装生产依赖
COPY --from=builder /app/dist ./dist  # ← 从阶段 1 复制编译产物
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

**效果**：最终镜像只有阶段 2 的内容——生产依赖 + `dist/`，体积少 ~400MB。

| | 单阶段 | 多阶段 |
|---|--------|--------|
| 包含 | 源码 + devDeps + dist | 仅生产依赖 + dist |
| 体积 | 大 | 小 |
| 安全性 | 低（含构建工具） | 高（最小运行时） |

### 5.4 `docker build` 本质上在做什么

你本地跑 `docker build` 不是在"编译代码"——NestJS 的 `npm run build` 才是。Docker 做的事是：

```
① 读 Dockerfile → 逐条执行指令，每条生成一个 layer（层）
② 所有 layer 叠加 → 形成完整镜像
③ 推到镜像仓库（Docker Hub / 阿里云 ACR）
④ ECS 从仓库 pull 镜像 → docker run 启动
```

**简单说：本地 build 好了推上去，服务器 pull 下来跑，服务器上不需要装 Node、装依赖、跑 build。**

### 5.5 分层缓存：为什么改了代码不重新传 700MB

Docker 镜像是**分层存储**的，每条 Dockerfile 指令一层：

```
FROM node:24.15-alpine         ← 层 1：系统基础（168MB，极少变）
COPY package*.json             ← 层 2：依赖清单（12KB，加包时才变）
RUN npm install --production   ← 层 3：node_modules（407MB，加包时才变）
COPY --from=builder /app/dist  ← 层 4：编译产物（0.4MB，每次改代码都变）
```

**Docker 按层对比 hash：**

| 场景 | 实际传输 |
|------|---------|
| 第一次 push | 全量 700MB |
| 改了业务代码，依赖没变 | **只传层 4 的 0.4MB** |
| 新增了一个 npm 包 | 层 3 + 层 4 重建，传 ~407MB |

**这就是 Dockerfile 指令顺序的设计哲学——不容易变的放前面，容易变的放后面。**

```dockerfile
COPY package*.json ./        # ← 放 COPY . . 前面！
RUN npm install              # ← 紧接着，这样只有 package.json 变时才重建依赖层
COPY . .                     # ← 源码放后面，每次改动不影响前面的缓存
RUN npm run build
```

> 你可以自己验证：改一行代码再 `docker build`，能看到前几层全是 `CACHED`，只有最后几层是 `NEW`。

用 `docker history` 直接看每层大小：

```bash
docker history nest-app-multi
```

输出示例：

```
IMAGE          CREATED BY                               SIZE
e197a39866cf   CMD ["node" "dist/main.js"]             0B
<missing>      COPY /app/dist ./dist                    422kB    ← 这是你的业务代码
<missing>      RUN npm install --production             407MB    ← 这是生产依赖
<missing>      COPY package*.json ./                    12.3kB
<missing>      apk add ... node ...                     153MB    ← 这是 Node 基础环境
```

**分层缓存省的不是"存储"——是"传输"和"构建"。** 镜像仓库里存的始终是完整镜像。但 push/pull 时只有变化的层需要传输。

### 5.6 多阶段构建 ≠ 分层缓存

| | 多阶段构建 | 分层缓存 |
|----|----------|---------|
| 解决什么问题 | 最终镜像里别带源码和 devDeps | 别每次都重建没变的层 |
| 怎么做到的 | builder 阶段构建 → runtime 阶段只拷贝产物 | 对比每层 hash，相同就跳过 |
| 省什么 | **文件体积** | **构建+传输时间** |
| 生效时机 | 任何一次 build | 改代码之后的下一次 build |

它们是两套独立机制，在你改代码重 build 时会一起起作用——多阶段保证镜像小，分层缓存保证快。

---

## 六、Docker Compose：一键编排多容器

### 6.1 为什么需要

单独跑一个 MySQL 容器要写一行 `docker run`，跑 Milvus 还要写三行（etcd + minio + standalone），加上 Nest 应用本身——全部手动跑太繁琐。Docker Compose 用一个 `docker-compose.yml` 描述所有服务，一条命令全起。

**所有容器默认处于同一内网，天然互通，可直接用容器名互相调用。** 比如 Nest 应用连接 MySQL 时写 `host: "mysql"`，Docker 会自动解析到 MySQL 容器的内网 IP。

### 6.2 开发环境：`docker-compose.dev.yml`

开发环境只编排**基础设施**（MySQL + Milvus），Nest 应用本身在本地用 `npm run start:dev` 跑——代码改动能热重载。

```yaml
services:
  mysql:
    image: mysql:latest
    container_name: mysql-dev
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: admin
      MYSQL_DATABASE: book              # ← 容器启动时自动创建这个数据库
    volumes:
      - ${DOCKER_VOLUME_DIRECTORY:-.}/volumes/mysql:/var/lib/mysql  # ★
    restart: always

  # Milvus 需要 etcd + minio 作为依赖
  etcd: ...
  minio: ...
  standalone:
    image: milvusdb/milvus:v2.5.25
    depends_on: [etcd, minio]           # ← 启动顺序
    ports: ["19530:19530"]
```

### 6.3 `${DOCKER_VOLUME_DIRECTORY:-.}` 是什么

```
${DOCKER_VOLUME_DIRECTORY:-.}/volumes/mysql
│                      │   │
│                      │   └── 路径后缀
│                      └── 默认值（没设环境变量时用 .）
└── 环境变量名
```

| 场景 | 实际路径 |
|------|---------|
| 设了 `DOCKER_VOLUME_DIRECTORY=/Users/guang/` | `/Users/guang/volumes/mysql` |
| 没设 | `./volumes/mysql`（当前目录下） |

**这样既支持默认值，又允许通过环境变量覆盖——不同机器上数据目录不一样时，不改 compose 文件只改环境变量。**

```bash
# package.json 里封装成命令
"docker:up": "DOCKER_VOLUME_DIRECTORY=/Users/guang/ docker compose -f docker-compose.dev.yml up -d",
"docker:down": "docker compose -f docker-compose.dev.yml down"
```

### 6.4 TypeORM + MySQL 开发流程

```
① docker compose up → MySQL 容器启动，自动创建 book 数据库
② NestJS 连接 MySQL（host: "localhost", port: 3306）
③ TypeORM 读取 Entity 定义，自动建表
④ BookService 做增删改查
```

```typescript
// book.entity.ts — Entity 和数据库表的一一映射
@Entity()
export class Book {
  @PrimaryGeneratedColumn() id: number;
  @Column() title: string;
  @Column() author: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) price: number;
  @Column() stock: number;
}

// app.module.ts — TypeORM 配置
TypeOrmModule.forRoot({
  type: 'mysql',
  host: 'localhost',  // 本地开发时连宿主机的 MySQL
  database: 'book',
  entities: [Book],
  synchronize: true,  // 开发环境自动建表
})
```

### 6.5 生产环境：`docker-compose.prod.yml`

和开发环境三个关键区别：

```yaml
services:
  mysql-prod:
    image: mysql:latest
    volumes:
      - ./volumes/mysql-prod:/var/lib/mysql  # ★ 数据隔离：不和 dev 共享
    restart: always                           # ★ 挂了自动重启

  nest-app:
    build:                    # ★ 不是拉镜像，是从 Dockerfile 本地构建
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DB_HOST: mysql-prod     # ★ 用容器名连接，不是 localhost
    depends_on:
      - mysql-prod
    restart: always
```

| | 开发 | 生产 |
|----|------|------|
| Nest 代码 | 本地 `npm run start:dev` | Dockerfile 构建 → 容器 |
| MySQL 连接 | `host: "localhost"` | `host: "mysql-prod"`（容器名） |
| 数据卷 | `volumes/mysql` | `volumes/mysql-prod`（隔离） |
| 重启策略 | 不重要 | `restart: always` |
| compose 文件 | `docker-compose.dev.yml` | `docker-compose.prod.yml` |

### 6.6 容器名就是域名

生产环境中 Nest 连接 MySQL 不能用 `localhost`——因为应用在容器 A 里，MySQL 在容器 B 里，容器的 `localhost` 只指自己。

**Docker Compose 自动做了 DNS：服务名 = 域名。**

```typescript
// 生产环境 TypeORM 配置
TypeOrmModule.forRoot({
  host: process.env.DB_HOST || 'localhost',  // 容器里 = "mysql-prod"
})

// 或者在 compose 里用环境变量注入
environment:
  DB_HOST: mysql-prod
```

### 6.7 静态文件：nest-cli.json 配置

NestJS 默认不输出 `public/` 目录到 `dist/`，需要配置：

```json
// nest-cli.json
{
  "compilerOptions": {
    "assets": [
      {
        "include": "../public/**/*",
        "outDir": "dist/public"
      }
    ]
  }
}
```

这样 `public/index.html` 会被复制到 `dist/public/index.html`，Dockerfile 的 `COPY --from=builder /app/dist ./dist` 会把它带进镜像。

---

## 七、常用命令速查

```bash
# 构建镜像
docker build -t nest-app .

# 运行容器
docker run -d --name nest-container -p 3006:3000 nest-app

# Compose 启动（开发环境）
docker compose -f docker-compose.dev.yml up -d

# Compose 启动（生产环境）
docker compose -f docker-compose.prod.yml up -d --build

# 查看运行中的容器
docker ps

# 停止并删除
docker compose -f docker-compose.dev.yml down

# 查看容器日志
docker logs nest-container
```

---

## 八、核心洞察

### 🔑 Dockerfile 的指令分两类

| 时机 | 指令 | 做什么 |
|------|------|--------|
| 构建时 | `FROM`, `WORKDIR`, `COPY`, `RUN` | 组装镜像内容 |
| 运行时 | `EXPOSE`, `CMD` | 声明端口 + 启动命令 |

**构建时做的事情改变镜像内容，运行时做的事情是容器启动后的行为。** 不能把 `docker run` 的命令写到 Dockerfile 里。

### 🔑 开发环境 vs 生产环境的区别不是技术，是思维

| | 开发 | 生产 |
|----|------|------|
| 目标 | 快，随时改 | 稳定，不能挂 |
| 代码来源 | 本地文件（hot reload） | 镜像构建产物 |
| 数据 | 可以和线上隔离 | 必须持久化 + 备份 |
| 重启策略 | 无所谓 | `restart: always` |

### 🔑 前端转后端的思维升级

```
前端思维：一个项目 → npm run dev → localhost:3000
后端思维：数据库 + 中间件 + 应用 → Docker Compose → 多个容器协作
```

前端只需要关心一个进程。后端要关心多个服务怎么编排、怎么通信、怎么容错。
