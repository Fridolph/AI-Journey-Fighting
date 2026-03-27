# 🚀 AI-Journey-Fighting

整理 AI 概念与原理（从“什么是 AI”到“大模型怎么训”）  记录学习中的感动——那些突然看懂某个概念的瞬间，最后实践做点小东西

## 📖 文档站点

本项目使用 VitePress 搭建文档站点，支持中英文双语，部署在 GitHub Pages 上。

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run docs:dev

# 构建生产版本
npm run docs:build

# 预览生产构建
npm run docs:preview
```

### 自动部署

项目配置了 GitHub Actions 自动部署，每次推送到 main 分支都会自动构建并部署到 GitHub Pages。

### 目录结构

```
├── docs/
│   ├── index.md              # 首页
│   ├── zh/                   # 中文文档
│   │   └── agents/           # AI学习记录
│   │       ├── foundation/       # 大模型基础
│   │       ├── prompt-engineering/ # 提示词工程
│   │       ├── agent-development/  # Agent开发
│   │       ├── multimodal/         # 多模态应用
│   │       ├── projects/           # 项目实战
│   │       └── resources/          # 学习资源
│   └── en/                   # 英文文档
│       └── agents/           # AI学习记录（英文）
└── .github/workflows/
    └── deploy.yml            # GitHub Actions部署配置
```

## 💡 使用说明

你可以随时把学习记录发给我，我会帮你整理到对应的目录中，支持中英文同步更新。
