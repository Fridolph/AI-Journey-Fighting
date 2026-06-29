# AI-Journey-Fighting 代码库架构总览

> 生成日期：2026-04-15
> 用途：快速了解仓库全貌，定位学习方向与文件位置

---

## 一、核心设计哲学：三层沉淀管道

```
examples/          →        drafts/          →        docs/
 (实验场)                   (草稿区)                  (发布层)
 跑 demo、做实验           记录理解、踩坑、复盘         VitePress 文档站
 保留原始 vs 修复对照      阶段总结                   公开输出到 GitHub Pages
```

这套管道的精妙设计在于：

- **不直接改原始示例代码**，新建 `*-fix.mjs`、`*-learning.mjs`、`*-debug.mjs` 等对照文件
- **「原版 vs 当前环境修复」的差异保留下来**，日后复盘时看清每一步改造的原因
- **草稿先于发布**，成熟内容才从 `drafts/` 精选进入 `docs/`，避免浮躁输出

---

## 二、目录结构总览

```
.
├── docs/                          ← 发布层：VitePress 文档站
│   ├── agents/                    │  AI 知识体系（五大专题）
│   │   ├── foundation/            │    大模型基础（21篇：01-什么是AI → 21-RAG）
│   │   ├── prompt-engineering/    │    提示词工程
│   │   ├── agent-development/     │    Agent 开发（12篇：Prompt→Tool → LangGraph）
│   │   ├── concept-map/           │    AI 概念地图
│   │   ├── fullstack/database/    │    全栈数据库（13篇：MySQL→IndexedDB）
│   │   ├── multimodal/            │    多模态（占位）
│   │   ├── projects/              │    项目实战（占位）
│   │   └── resources/             │    学习资源（占位）
│   ├── articles/                  │  已发表文章归档（15篇）
│   ├── prompts/                   │  Prompt 收藏（5大类）
│   │   ├── creative-posters/      │    创意海报
│   │   ├── infographics/          │    信息图（含易经64卦）
│   │   ├── portrait-analysis/     │    人像诊断
│   │   ├── documentary-sim/       │    纪实模拟
│   │   └── frontend-engineering/  │    前端工程
│   ├── records/                   │  学习进度记录
│   └── .vitepress/                │  站点引擎
│       ├── config.ts              │    VitePress 配置（导航、侧边栏、数学公式）
│       ├── data/aiConceptMap.ts   │    AI 概念地图数据源（依赖关系图）
│       └── theme/                 │    自定义 Vue 组件
│           ├── components/        │      AiConceptMap.vue 等交互组件
│           └── custom.css         │      全局样式
│
├── examples/                      ← 实验场：17 个学习方向的独立项目
│   ├── prompt-template-test/      │  Prompt 模板 / Few-shot / Pipeline
│   ├── rag-test/                  │  RAG 基础：Loader、Splitter、向量检索
│   ├── milvus-test/               │  Milvus 向量数据库 CRUD + 召回对比
│   ├── advanced-rag/              │  高级 RAG：多跳检索、查询路由、Web Fallback
│   ├── resume-memory-rag-qa/      │  RAG 综合实战（简历问答）v4→v7 迭代
│   ├── memory-test/               │  Memory：截断/摘要/检索记忆
│   ├── tool-test/                 │  Tool Calling、MCP
│   ├── output-parser-test/        │  Structured Output、Output Parser（当前重点）
│   ├── runnable-test/             │  LangChain Runnable 原语（LCEL）
│   ├── langgraph-test/            │  LangGraph：图、条件路由、中断、多 Agent
│   ├── hello-nest-langchain/      │  NestJS + LangChain 集成
│   ├── agui-backend/              │  全栈 Agent UI 后端（NestJS）
│   ├── agui-frontend/             │  全栈 Agent UI 前端（React）
│   ├── cron-job-tool/             │  Agent + 定时任务 + 数据库 CRUD
│   ├── asr-and-tts-nest-service/  │  语音识别 + 语音合成服务
│   └── tts-stt-test/              │  TTS/STT 基础实验
│
├── drafts/                        ← 草稿区：学习过程笔记（与 examples 一一对应）
│   ├── advanced-rag/              │
│   ├── langgraph-test/            │  9 篇系统学习笔记（最完整）
│   ├── memory-test/               │
│   ├── output-parser-test/        │  当前重点推进方向
│   └── ...                        │  共 16 个笔记子目录
│
├── scripts/                       ← 工具脚本
│   └── milvus-backup.sh           │  Milvus 备份
│
├── .github/workflows/             ← CI/CD
│   └── deploy.yml                 │  push main → npm ci → vitepress build → GitHub Pages
│
├── AGENTS.md                      ← Agent 协作规范（本 AI 的行为边界）
├── README.md                      ← 项目总览
├── package.json                   ← VitePress + markdown-it-mathjax3
├── reasonix.toml                  ← AI 助理配置
├── .env.example                   ← 环境变量模板
└── milvus-standalone-docker-compose.yml
```

---

## 三、发布链路（CI/CD 数据流）

```
开发者 push main
  → GitHub Actions (deploy.yml) 触发
    → Setup Node 20
    → npm ci（装 VitePress + markdown-it-mathjax3）
    → npm run docs:build（vitepress build docs）
    → 产物：docs/.vitepress/dist/
    → actions/upload-pages-artifact
    → actions/deploy-pages → GitHub Pages
```

这条链路的特点：

- **纯静态**，没有后端服务器，只是文档构建
- **触发即发布**，push main 自动上线
- **workflow_dispatch 也支持**，可以手动触发

---

## 四、知识组织特色

### 4.1 概念地图（双向链接）

`docs/.vitepress/data/aiConceptMap.ts` 维护了一张 AI 概念之间的依赖关系图，而非孤立页面列表。Vue 组件（`AiConceptMap.vue`、`ConceptMapBoard.vue`、`ConceptMapDetail.vue`）实现交互可视化。

### 4.2 三线并行

```
docs/agents/        → 系统性概念文档（方法论）
docs/articles/      → 已发表文章归档（阶段性输出）
概念地图            → 知识点之间的依赖关系（知识网络）
```

### 4.3 Prompt 收藏体系

`docs/prompts/` 不仅收藏 prompt，还按使用场景分类（海报、信息图、人像、纪实、工程），其中「易经六十四卦」有 64 个独立子目录，是最庞大的子集合。

---

## 五、学习路径（建议阅读顺序）

### 第一阶段：AI 基础
```
docs/agents/foundation/01～21
```

### 第二阶段：Agent 开发
```
docs/agents/agent-development/01～12
  ├── 01 Prompt → Tool       → examples/prompt-template-test/
  ├── 02 Agent 记忆系统       → examples/memory-test/
  ├── 03 RAG + Milvus        → examples/rag-test/ + milvus-test/
  ├── 04 简历 RAG 迭代       → examples/resume-memory-rag-qa/
  ├── 05 LCEL                → examples/runnable-test/
  ├── 06 NestJS 集成         → examples/hello-nest-langchain/
  └── 07～12 LangGraph       → examples/langgraph-test/
```

### 第三阶段：专项深入
```
├── Tool Calling / MCP       → examples/tool-test/
├── Structured Output        → examples/output-parser-test/（当前推进中）
├── 全栈 Agent UI            → examples/agui-backend/ + agui-frontend/
├── 语音 TTS/STT             → examples/tts-stt-test/
```

---

## 六、关键设计决策

| 决策 | 说明 |
|------|------|
| 中文单语文档 | 不再维护双语同步，降低维护成本 |
| 草稿先行 | 先 draft 再 doc，避免只贴结论 |
| 示例代码不修改 | 新建 `*-fix.mjs` 等对照文件，保留原始版 vs 修复版差异 |
| 每个示例独立 `package.json` | 避免依赖冲突，每个项目可以有自己的版本 |
| 技术栈统一在根 package.json | 仅管理 VitePress 文档站依赖 |
| Astro → VitePress | 文章数少时 Astro 够用，内容增长后 VitePress 的侧边栏和搜索更合适 |

---

## 七、当前状态与下一步

- ✅ 已完成：21 篇 AI 基础 + 12 篇 Agent 开发 + 站点部署 + 概念地图
- 🔄 进行中：`output-parser-test/`（Structured Output、Output Parser）
- 📋 待办：Memory、LangGraph、Evaluation 文档补全，更多实验从 `drafts/` 进入 `docs/`
