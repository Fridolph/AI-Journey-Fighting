# Docker（容器化）

## 一句话

**把应用和环境打包成一个「集装箱」——在哪跑都一样，不用重装依赖。**

## 核心概念

| 概念 | 是什么 | 前端类比 |
|------|--------|---------|
| **镜像（Image）** | 应用+环境的只读快照 | `node_modules` + 系统依赖的 tar 包 |
| **容器（Container）** | 镜像的运行实例 | tar 包解压后跑的进程 |
| **Dockerfile** | 镜像的「构建配方」 | `package.json` + `webpack.config` |

## 为什么前端需要学

前端转全栈的第一道坎：自己装 MySQL、Redis、Milvus……各种数据库的安装流程各不相同，环境变量、端口、数据目录配置起来容易出错。Docker 一条命令解决：

```bash
docker run -d --name mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=admin mysql:latest
```

不用去官网下安装包、不用配置 my.cnf、不用纠结 macOS 和 Linux 路径差异。

## 应用场景

| 场景 | 说明 |
|------|------|
| **本地开发环境** | 一键起 MySQL/Redis/Milvus，和别人协作时环境完全一致 |
| **微服务部署** | 每个服务一个容器，独立扩缩容 |
| **AI 模型部署** | 模型 + Python 依赖 + CUDA 驱动 → 一个镜像，到处跑 |

## 横向对比：Docker vs 传统部署

| | 传统部署 | Docker |
|---|---|---|
| 环境配置 | 手动安装依赖，不同机器可能不同 | Dockerfile 固化，一致 |
| 启动速度 | 分钟级（装依赖） | 秒级（镜像已有） |
| 隔离性 | 进程级，可能冲突 | 容器级，完全隔离 |
| 迁移性 | 「在我机器上能跑」 | 任何装了 Docker 的机器都能跑 |

## 优缺点

**优点：** 环境一致、快速启动、资源隔离、生态丰富（Docker Hub）
**缺点：** 学习曲线（镜像/容器/卷/网络一堆概念），macOS 上性能不如 Linux 原生，镜像体积可能很大

## 小结

Docker 是后端世界的 `npm install`——它标准化了「环境配置」这件事。作为前端转全栈，你不需要成为 Docker 专家，但至少要做到：能看懂 Dockerfile、能用 `docker-compose up` 起服务、能分清镜像和容器。

## 下一步

- [Docker Compose](./docker-compose.md) — 一键编排多容器
- [多阶段构建](./multi-stage-build.md) — 给镜像瘦身
