---
title: 「部署」前端转全栈需了解的 Docker + CI/CD 核心知识
published: 2026-04-27
updated: 2026-05-29
tags: [Docker, CI/CD, 部署, 全栈]
category: 工程化
---

> 📌 **系列简介**：《my-resume AI实战》部署过渡篇。
> 
> 本篇：建立最小部署认知 / 下一篇：真实踩坑复盘
> 
> *前端转 JS 全栈，正在学部署，理解难免有偏差，欢迎批评指正 ~*
> 
> *（2026-05 更新：部署方案已从手动 SSH 升级为一键 `release-from-local.sh`，镜像构建也升级为多阶段 + Next standalone 输出。）*

---


## 写在前面

两年前掘金写了篇博客 [学习TailWindCSS顺便打造个性化在线简历项目](https://juejin.cn/post/7334929489195909170) 当时也有朋友问怎么没做CICD ~

当时的心路历程，1是麻烦，2是不会… https nginx 把这些折腾上去都够呛，不想学新的了 ……

AI时代，再停留真要被落下了，那么就让AI带着自己一起跑吧。虽上高速但只跑 60Km/h  = = 

废话少说。接下来把学习和折腾历程发出来。这篇想把我理清楚这三个边界的过程写下来—— 三个边界：构建、运行、数据。
不是完整的 Docker 教程，是个人前端视角转全栈阶段，用得上的那些。

---

## 一、先把概念对齐：最容易混的 6 组

学 Docker 最痛苦的阶段，是概念还没对齐就开始操作——
报错了不知道是哪一层的问题，改了半天改错了地方。

我整理了最容易混的 6 组，先对齐再往下走：

| 容易混淆 | 正确认知 |
|---|---|
| **Image vs Container** | Image 是封箱好的运行包；Container 是它跑起来的实例。镜像像类，容器像对象。 |
| **Registry / Repository / Tag** | Registry 是仓库服务（比如 GHCR）；Repository 是镜像名空间；Tag 是具体版本指针。 |
| **ARG vs ENV** | ARG 只在构建期有效；ENV 会进入运行时容器，服务启动后还在。 |
| **EXPOSE vs ports** | EXPOSE 只是声明，不对外开放；真正映射端口靠 Compose 的 `ports` 字段。 |
| **Volume vs Bind Mount** | Volume 更适合生产持久化；Bind Mount 更适合本地开发联调。 |
| **Build vs Run** | 构建阶段解决"产物一致性"；运行阶段解决"实例可用性与配置注入"。 |

把这 6 组搞清楚，排障时至少知道问题出在哪一层。

---

## 二、为什么"上线后就能运行"？

搞清楚概念之后，我才真正理解了一件事——

**上线的不是源码，是可运行工件。**

在 Docker 路线里，这个工件是镜像（Image）：包含代码、运行环境（Node、依赖、系统库）、启动命令。

服务器只做两件事：**拉镜像 + 启容器**。

这就是"发布成功即可运行"的基础。
也是为什么换了服务器、换了机器，只要能拉到镜像，服务就能跑起来。

---

## 三、从代码到用户访问：一条链路

```mermaid
flowchart LR
  A["本地开发"] --> B["git tag + push"]
  B --> C["release-from-local.sh<br/>一键构建 + 推送"]
  C --> D["docker buildx<br/>多服务并行构建"]
  D --> E["推送到 GHCR<br/>带 v2.3.1 tag"]
  E --> F["ECS release.sh<br/>pull 镜像 + compose up"]
  F --> G["Nginx 反向代理"]
  G --> H["用户访问域名"]
```

这条链路的关键是：**构建和运行分离。**

- 构建在本地 / CI 完成：有算力、有缓存、可重试，产物一致
- 运行在 ECS 完成：尽量轻量，只负责拉起服务

我现在用的是一键脚本 `deploy/ecs/release-from-local.sh`——打上 git tag 之后，一条命令完成构建镜像、推送到 GHCR、SSH 到 ECS 拉取并启动：

```bash
./deploy/ecs/release-from-local.sh \
  --tag v2.3.1 \
  --ecs-host your-ecs-ip \
  --stack-env ./.env.stack.local
```

我之前习惯"SSH 上服务器直接跑"，后来发现这样有两个问题：
本地环境和服务器环境不一致，出了问题很难复现；
而且没有版本记录，出事了不知道回滚到哪里。

Docker 镜像 + GHCR + tag 版本号，解决的就是这两个问题。

---

## 四、Dockerfile：真正需要懂的 7 件事（含真实案例）

Dockerfile 定义镜像怎么构建。经过多轮迭代，我项目里的 Dockerfile 已经演进为多阶段构建。以下是 `apps/server/Dockerfile` 的实际结构（5 阶段）：

```dockerfile
# 阶段 1：基础镜像（Node + pnpm）
FROM node:22-slim AS base
RUN npm install -g pnpm@10.8.0
WORKDIR /app

# 阶段 2：运行时基础（系统依赖，如 PDF 导出用的中文字体）
FROM base AS runtime-base
RUN apt-get update && apt-get install -y fonts-noto-cjk

# 阶段 3：依赖安装（利用缓存 —— 只复制 package.json）
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY packages/*/package.json packages/*/package.json
RUN pnpm install --frozen-lockfile --filter @my-resume/server...

# 阶段 4：构建（编译 TypeScript → dist）
FROM deps AS builder
COPY . .
RUN pnpm --filter @my-resume/server build
RUN pnpm --filter @my-resume/server deploy --legacy --prod /prod/server

# 阶段 5：运行（只复制必要产物，镜像最小化）
FROM runtime-base AS runner
ENV NODE_ENV=production
COPY --from=builder /prod/server/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
CMD ["node", "apps/server/dist/src/main.js"]
```

Web 和 Admin 端用的是 Next.js standalone 输出，4 阶段：

```dockerfile
FROM node:22-slim AS base          # 基础环境
# ...
FROM base AS deps                   # 依赖安装
# ...
FROM deps AS builder                # Next.js build (输出 .next/standalone)
ARG NEXT_PUBLIC_API_BASE_URL        # 构建时注入 API 地址
RUN pnpm --filter @my-resume/web build

FROM base AS runner                 # 运行层：只复制 standalone 产物
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
CMD ["node", "apps/web/server.js"]
```

### 缓存层的顺序很重要

Dockerfile 每条指令都是一层，前面的层变了，后面的缓存全部失效。

我踩过的坑：把 `COPY . .` 放在 `RUN pnpm install` 前面——
每次改一行业务代码，依赖就重新安装一遍，构建时间从 30 秒变成 3 分钟。

正确做法：**先复制 `package.json`，装完依赖，再复制业务代码。**
依赖没变，那一层缓存就命中，只有业务代码那层重新构建。

### 多阶段构建：让镜像更小

Builder 阶段的编译缓存、devDependencies，全部不进最终镜像。
对小规格 ECS 来说，镜像越小，拉取越快，发布越稳。
我的 server 镜像从 1.2GB 压到了约 380MB，web/admin 用 Next standalone 后约 250MB，就靠这一步。

---

## 五、Compose：多服务的"启动说明书"

my-resume 有三个服务：`web`（用户端，5555 端口）、`admin`（后台，5566 端口）、`server`（API，5577 端口）。
Compose 让这三个服务按规则一起跑。

真实用到的 `docker-compose.yml` 核心字段：

```yaml
services:
  server:
    build:                         # 或 image: ghcr.io/... 镜像模式
      context: .
      dockerfile: apps/server/Dockerfile
    env_file:
      - .env                       # 运行时配置（JWT、数据库、AI Provider 等）
    ports:
      - '5577:5577'
    volumes:
      - resume_sqlite_data:/app/.data   # SQLite 数据库持久化

  web:
    build:
      dockerfile: apps/web/Dockerfile
      args:
        NEXT_PUBLIC_API_BASE_URL: http://localhost:5577   # 构建时注入
        RESUME_API_BASE_URL: http://server:5577           # SSR 内部调用
    depends_on:
      - server                     # 启动顺序（只保证顺序，不等就绪）
    ports:
      - '5555:5555'

  admin:
    build:
      dockerfile: apps/admin/Dockerfile
      args:
        NEXT_PUBLIC_API_BASE_URL: http://localhost:5577
    depends_on:
      - server
    ports:
      - '5566:5566'

volumes:
  resume_sqlite_data:              # 命名卷：数据不随容器销毁而丢失
```

有一个我之前理解错的地方：

**`depends_on` 只保证容器启动顺序，不保证服务真的可用。**

数据库容器启动了，不代表数据库已经接受连接了。
要配合应用层重试，才能真正保证依赖可用。

---

## 六、线上稳定性的最小闭环

跑通部署之后，我意识到还差三件事：知道服务活没活、出问题能看日志、出问题能回滚。

### 健康检查

`GET /api/health` 端点不仅检查进程存活，还检查数据库连通性。
我遇到过进程在但数据库连接断了，外面看着"绿色"，实际上所有请求都在报错。

### 日志

出了问题，先看容器日志：

```bash
docker compose logs -f server
```

大多数问题——环境变量缺失、数据库连接失败、端口冲突——日志里都有。
先看日志，再看源码，别一上来就改代码。

### 回滚

镜像 tag 要用可追溯的版本号，不要只用 `latest`。

ECS 上的发布管理采用了**快照目录 + 软链接**策略：

```
~/my-resume/
  current -> release-snapshots/v2.3.0    ← 当前运行版本
  release-snapshots/
    v2.2.9/     ← 上上个版本
    v2.3.0/     ← 上一个版本（保留）
    v2.3.1/     ← 新版本
```

发布时在 `release-snapshots/` 下创建新目录 → 拉起新容器 → 验证通过后切换 `current` 软链接。出问题时，回滚就是一条命令：

```bash
./deploy/ecs/rollback.sh   # 自动切回上一个 release snapshot
```

不需要重新排查编译环境，不需要重新部署代码——**切版本，就完了。**

---

## 七、CI/CD 在干嘛

可以把它理解成三段流水线：

```
1. CI 检查     代码合格（test、typecheck、build 验证）
     ↓
2. Build      构建镜像，push 到 GHCR，打上版本 tag
     ↓
3. CD 部署     ECS 拉指定 tag，创建 release snapshot，compose up
```

比"SSH 上服务器手动构建"稳的原因：
- 构建环境一致，不会出现"我本地好的"
- 每个版本有 tag（如 `v2.3.1`），可追溯
- ECS 保留最近两个 release snapshot，出问题可快速回滚
- 支持增量发布：只改 `web`/`admin` 时，server 镜像从上一个 tag 复用

---

## 八、常用命令：够用就行

### 查看状态

```bash
docker ps                           # 看运行中的容器
docker images                       # 看本地镜像
docker compose ps                   # 看 compose 服务状态
docker compose logs -f              # 实时看日志
```

### 部署操作

```bash
docker compose pull                 # 拉最新镜像
docker compose up -d                # 启动（镜像模式不重新构建）
docker compose down                 # 停止并删除容器
```

### 一键发布（本地 → GHCR → ECS）

```bash
# 完整流程：构建镜像 + 推送 + SSH 到 ECS 部署
./deploy/ecs/release-from-local.sh --tag v2.3.1 --ecs-host <ip>

# 只推送构建产物，不部署（用于 GitHub Actions CI）
./deploy/ecs/release-from-local.sh --tag v2.3.1 --skip-deploy
```

### 排障

```bash
docker inspect <container>          # 看容器详细配置
docker exec -it <container> sh      # 进容器排查
curl -i http://127.0.0.1:<port>     # 测试服务是否可达
```

---

## 九、这阶段该学多深？

我的判断：先学"能跑通 + 能排障 + 能回滚"，不要一次学太深。

**现在要会的：**
- 写/读 Dockerfile，理解多阶段构建和缓存层顺序
- 读懂 Compose 核心字段（`image`/`build`/`ports`/`env_file`/`volumes`/`depends_on`）
- 看日志、看健康检查
- 跑通本地构建 + ECS 拉镜像部署的完整闭环
- 用 tag 做回滚，理解 snapshot 管理

**可以后置的：**
- 内核细节（cgroups / namespace / overlayfs）
- 大规模集群调度（K8s）
- 复杂网络与安全策略

不是这些不重要，是当前阶段投入产出比不高。
把能跑通、能排障、能回滚做扎实，比看完整本书更有用。

---

## 写在最后

做完这套部署之后，我对"部署"这件事的理解变了——

它不是神秘的运维操作，是工程化的延伸：
**把可运行工件，稳定地、可追溯地、可回滚地送到线上。**

从最开始的手动 SSH + `npm run build`，到 Docker 一键构建，再到 `release-from-local.sh` 一条命令完成全流程——
每一步都不是一次性做对的，而是在真实踩坑中慢慢补起来的。

前端做工程化，讲的是构建产物的一致性和可维护性。
Docker + CI/CD 做的是同一件事，只是把边界从"浏览器能跑"扩展到了"服务器能跑"。

想清楚这一点之后，Docker 就没那么陌生了。

---

## 参考文档

- [Docker Overview](https://docs.docker.com/get-started/docker-overview/)
- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/)
- [Multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [Compose file reference](https://docs.docker.com/reference/compose-file/)
- [Next.js Standalone Output](https://nextjs.org/docs/pages/api-reference/config/next-config-js/output)
- [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/)
- [Volumes](https://docs.docker.com/engine/storage/volumes/)
- [Twelve-Factor App / Config](https://12factor.net/config)
- [my-resume 部署文档](https://github.com/Fridolph/my-resume/tree/main/deploy/ecs)

---

*昇哥 · 2026年6月
*my-resume 部署上线途中，把想清楚的事写下来*
