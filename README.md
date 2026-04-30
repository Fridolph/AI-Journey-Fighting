# AI-Journey-Fighting

[![Deploy Docs to GitHub Pages](https://github.com/Fridolph/AI-Journey-Fighting/actions/workflows/deploy.yml/badge.svg)](https://github.com/Fridolph/AI-Journey-Fighting/actions/workflows/deploy.yml)

一个持续迭代的 AI 学习与实战仓库。

这个项目不是“只放结论”的笔记仓库，而是把 AI 学习过程拆成三层来沉淀：

- `examples/` 里跑 demo、做实验、踩坑排查
- `drafts/` 里记录过程、理解、问题与复盘
- `docs/` 里整理成可公开阅读的 VitePress 文档

目标很明确：从 AI 基础概念出发，逐步走到 RAG、Tool Calling、Memory、Agent Loop、Structured Output、LangGraph 等方向，并把“能跑通 + 能讲清楚 + 能复盘”沉淀成长期资产。

## 在线访问

- 文档站：[AI Journey Fighting](https://fridolph.github.io/AI-Journey-Fighting/)
- 仓库地址：[Fridolph/AI-Journey-Fighting](https://github.com/Fridolph/AI-Journey-Fighting)

## 这个项目的特点

### 1. 不是只整理知识，而是把学习过程公开化

这里不仅有概念文档，也保留了：

- 实验代码
- 学习草稿
- 修复版 / 兼容版 / 对照版示例
- 阶段性文章输出

这样后续复盘时，能清楚知道：

- 原始代码是什么
- 为什么当前环境跑不通
- 做了哪些修复
- 自己真正学到了什么

### 2. 用“代码 + 文档 + 概念地图”一起组织学习

项目现在不是单一文档站，而是三条线并行：

- `docs/agents/`：系统化概念与专题文档
- `docs/articles/`：已发表文章归档
- `docs/.vitepress/data/aiConceptMap.ts`：AI 学习概念地图的数据源

概念地图会把基础概念、RAG、Agent、工程化能力连成一张持续生长的图，而不是散落成一堆孤立页面。

### 3. 默认保留原始示例，对学习改动做对照沉淀

针对 `examples/` 下的学习型示例，当前遵循的原则是：

- 默认不直接改原始教程文件
- 兼容修复、调试排查、学习注释优先新建文件
- 差异说明优先写进 `drafts/`

这让整个仓库更适合长期学习，而不是一次性跑完 demo 就丢掉。

## 技术栈

### 文档与站点

- [VitePress](https://vitepress.dev/)：文档站生成
- `markdown-it-mathjax3`：数学公式渲染
- GitHub Pages：静态站点托管
- GitHub Actions：自动构建与部署

### 学习与实验方向

当前仓库中的示例主要覆盖：

- Prompt Engineering
- RAG / Advanced RAG
- Vector DB / Milvus
- Memory / Retrieval Memory
- Tool Calling / Agent Loop
- Structured Output / Output Parser
- LangGraph
- 多模态、语音、TTS / STT
- NestJS / React 等应用层实验

## 当前学习进程

### 已经完成并对外公开的部分

- AI 基础概念文档已整理到 `docs/agents/foundation/`
- Prompt Engineering、Agent Development 等专题目录已建立
- 已发表文章已统一整理到 `docs/articles/`
- AI 概念地图页与维护说明已经接入站点
- GitHub Pages 自动部署已经打通

### 当前重点推进中

- `examples/output-parser-test/`
  - Structured Output
  - Output Parser
  - mini-cursor / tool call 学习
  - 兼容性修复与最小实验记录

### 下一阶段方向

- 继续补全 `Memory`、`LangGraph`、`Structured Output`、`Evaluation` 等站内文档
- 让更多实验从 `drafts/` 进入 `docs/`
- 完善概念地图，形成更清晰的学习路径与依赖关系

## 项目结构

```text
.
├── docs/                    # 对外发布文档（VitePress）
│   ├── agents/              # AI 概念与专题文档
│   ├── articles/            # 已发表文章归档
│   ├── records/             # 阶段性学习记录
│   └── .vitepress/          # 站点配置、主题组件、概念地图数据
├── drafts/                  # 学习过程草稿、踩坑记录、阶段总结
├── examples/                # 学习 demo、实验代码、兼容修复版
├── archive/                 # 暂不参与发布的历史资料
├── AGENTS.md                # 协作与学习规范
└── .github/workflows/       # GitHub Actions 工作流
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 本地启动文档站

```bash
npm run docs:dev
```

### 3. 本地构建

```bash
npm run docs:build
```

### 4. 本地预览构建结果

```bash
npm run docs:preview
```

## 学习与沉淀方式

每学习一个 `examples/<category>`，基本按这个流程走：

1. 阅读对应 demo 与参考文章
2. 本地跑通关键流程
3. 在 `drafts/<category>/` 记录目标、步骤、问题与理解
4. 形成阶段总结
5. 将成熟内容整理进 `docs/`

这个仓库更重视“学习链路完整”，而不是只保留最后答案。

## 文档发布与 CI/CD

当前文档发布已经自动化：

- push 到 `main`
- GitHub Actions 执行 `npm ci`
- 执行 `npm run docs:build`
- 发布 `docs/.vitepress/dist` 到 GitHub Pages

工作流文件：

- [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)

## Roadmap

- [x] 切换为中文单语文档站
- [x] 打通 GitHub Pages 自动部署
- [x] 建立 AI 概念地图
- [x] 整理已发表文章归档
- [ ] 持续补全文档与实验的双向链接
- [ ] 完善更多 Agent / RAG / Evaluation 学习专题
- [ ] 逐步形成更稳定的学习方法论与项目模板

## 适合谁

如果你也在经历下面这些阶段，这个仓库会比较适合你：

- 想系统学 AI，但不想只看碎片文章
- 想从概念走到代码，而不是停留在术语层面
- 想保留真实学习过程，而不是只看“成功版本”
- 想把个人学习慢慢整理成可公开输出的内容

## 开源说明

- 当前文档以中文为主
- 项目会持续迭代，不追求一步到位
- 欢迎 Issue、讨论与交流

如果你也在做类似的 AI 学习记录，欢迎一起交流，互相对照进步。
