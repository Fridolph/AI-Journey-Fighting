# 多阶段构建（Multi-stage Build）

## 一句话

**把「编译」和「运行」拆成两步——编译时用重型工具，运行时只保留最小文件。**

## 为什么需要

Node.js 项目的 Docker 镜像很容易到 700MB+——因为 `node_modules`（含 devDependencies）+ TypeScript 源码 + 编译后的 JS 全塞一个镜像里。线上只需要 `dist/` + 生产依赖。

## 怎么做

```dockerfile
# ═══ 阶段 1：构建 ═══
FROM node:24-alpine AS builder
COPY . .
RUN npm install
RUN npm run build           # 编译 TS → JS

# ═══ 阶段 2：运行 ═══
FROM node:24-alpine
COPY --from=builder /app/dist ./dist      # ← 只从阶段 1 复制编译产物
COPY package*.json ./
RUN npm install --production              # ← 只装生产依赖
CMD ["node", "dist/main.js"]
```

最终镜像只有 `dist/` + 生产依赖，体积从 ~700MB 降到 ~200MB。

## 和多阶段构建配套的分层缓存

```dockerfile
COPY package*.json ./      # 先复制依赖清单
RUN npm install            # 装依赖 → 这一层在 package.json 不变时缓存
COPY . .                   # 后复制源码 → 每次改代码只重建这层及后续
RUN npm run build
```

## 优缺点

**优点：** 镜像体积大幅缩小，不含构建工具更安全，部署更快
**缺点：** 构建时间略增（多一个阶段），Dockerfile 稍复杂

## 小结

多阶段构建是 Docker 镜像瘦身的标准做法。记住一个原则：**编译阶段可以肥，运行阶段必须瘦。**

## 下一步

- [Docker](./docker.md) — Docker 基础
- [Docker Compose](./docker-compose.md) — 用 Compose 编排多阶段构建的镜像
