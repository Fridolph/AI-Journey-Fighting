# 🚀 AI-Journey-Fighting

这是一个「AI 学习实战日志」项目：  
从 AI 入门概念梳理，逐步走到 Agent 开发实战，并把过程沉淀为可复用文档。

## 🎯 我在做什么

- 先在 `docs/` 系统整理 AI 基础概念（从入门到理解大模型关键机制）。
- 再进入 `examples/`，跟着博主文章逐个跑通 demo。
- 每完成一次学习，就把“过程 + 理解 + 感悟”写进 `drafts/`。
- 最后把成熟内容整理到 VitePress，形成可公开阅读的知识内容。

> 当前学习顺序按个人进度推进，不强依赖博主项目原始顺序。

## 🗂️ 学习与沉淀流程

1. 选择一个 `examples/<category>` 目录学习。
2. 结合博主文章阅读并运行代码。
3. 在 `drafts/<category>/` 创建或更新 Markdown 记录。
4. 当该类别学习完成后，整理一篇阶段总结。
5. 将可发布内容迁移到 `docs/`，用于 VitePress 展示。

> 约定：`examples/` 下的原始教程示例默认保留不改；兼容修复、调试版本、学习注释版优先新建文件，与原文件形成对照。

## 🚀 文档发布

- 文档站基于 VitePress，构建命令是 `npm run docs:build`
- 每次推送到 `main`，都会自动触发 `.github/workflows/deploy.yml`
- Workflow 会构建并上传 `docs/.vitepress/dist`，然后发布到当前仓库的 GitHub Pages
- 仓库首次启用时，需要在 GitHub 仓库设置中将 Pages Source 设为 `GitHub Actions`

## 📁 目录结构（核心）

```text
├── docs/           # 最终发布文档（VitePress）
├── examples/       # 学习 demo 与实验代码
├── drafts/         # 按 examples 分类沉淀学习草稿
├── AGENTS.md       # 协作与学习流程规范
└── .github/workflows/
    └── deploy.yml  # 文档自动部署
```

## 🌍 开源说明

- 项目将持续开源迭代，记录真实学习路径与实践经验。
- 欢迎关注、交流和提出建议，一起把 Agent 学习做成长期可积累的内容资产。
- 文档后续以中文为主，不再强制维护双语同步。

## 🛠️ 本地开发

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:preview
```
