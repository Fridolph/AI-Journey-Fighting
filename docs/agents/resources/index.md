# 学习资源

> 吃水不忘挖井人。这里整理了本学习旅程中参考、引用、依赖的所有资源。

---

## 🎓 学习路线来源

### 主线课程

| 资源 | 说明 |
|------|------|
| [AlAgent开发要学什么？](https://mp.weixin.qq.com/s/A7M8Dx9Ep_iDOKfVrDRYUg) | **本项目的学习路线图**，从 Agent 设计模式 → 工具使用 → RAG → 多智能体 → 全栈落地，一路跟着这个系列走过来的。如果你也想系统学 AI Agent 开发，强烈推荐从这里开始。 |
| [《Agentic Design Patterns》](https://adp.xindoo.xyz) | Agent 设计模式中文参考，提示链、路由、并行化、反思、工具使用、规划、多智能体等模式详解，与系列一文章对应。 |

---

## 📚 框架 & 库

### LangChain 生态（核心）

| 包 | 用途 | 文档 |
|---|---|---|
| `langchain` | LangChain 主包，ReAct Agent、createAgent 等高层 API | [js.langchain.com](https://js.langchain.com/) |
| `@langchain/core` | 核心抽象：PromptTemplate、StringOutputParser、Runnable、messages | - |
| `@langchain/openai` | ChatOpenAI 模型接入 | - |
| `@langchain/langgraph` | StateGraph、Annotation、checkpointer、interrupt、Command | [langchain-ai.github.io/langgraphjs](https://langchain-ai.github.io/langgraphjs/) |
| `@langchain/langgraph/prebuilt` | ToolNode、toolsCondition、createReactAgent | - |
| `@langchain/langgraph-supervisor` | createSupervisor 多智能体调度 | - |
| `@langchain/langgraph-checkpoint-sqlite` | SqliteSaver 持久化 checkpointer | - |
| `@langchain/community` | 社区集成：Milvus vectorstore、CheerioWebBaseLoader 等 | - |
| `@langchain/textsplitters` | RecursiveCharacterTextSplitter 文档切分 | - |

### 后端框架

| 框架 | 用途 | 文档 |
|---|---|---|
| [NestJS](https://nestjs.com/) | 全栈后端框架，本项目 demo 的服务端基座 | [docs.nestjs.com](https://docs.nestjs.com/) |
| `@nestjs/schedule` | NestJS 定时任务（CronJob） | - |
| [Prisma](https://www.prisma.io/) | TypeScript ORM，数据库 Schema 定义 + 类型安全 CRUD | [prisma.io/docs](https://www.prisma.io/docs/) |

### 数据库 & 检索引擎

| 工具 | 用途 | 文档 |
|---|---|---|
| [Milvus](https://milvus.io/) | 向量数据库，RAG 语义检索核心 | [milvus.io/docs](https://milvus.io/docs/) |
| [ElasticSearch](https://www.elastic.co/) | 全文检索引擎，倒排索引 + BM25 + IK 分词 | [elastic.co/guide](https://www.elastic.co/guide/index.html) |
| PostgreSQL | 关系型数据库，全栈项目主力 | - |
| MySQL | 关系型数据库 | - |
| MongoDB | 文档型数据库 | - |
| Redis | 缓存数据库 | - |
| SQLite | 嵌入式数据库，checkpointer 本地持久化 | - |
| Neo4j | 图数据库，GraphRAG 知识图谱检索 | - |

### 部署 & 工具

| 工具 | 用途 | 文档 |
|---|---|---|
| [Docker](https://docs.docker.com/) | 容器化部署，所有基础设施服务的运行环境 | - |
| [Docker Compose](https://docs.docker.com/compose/) | 多服务编排（Milvus + ES + Nest 应用一键启动） | - |

### AI 模型 API

| 平台 | 用途 |
|---|---|
| [OpenAI](https://platform.openai.com/docs/) | GPT 系列模型 |
| [DeepSeek](https://platform.deepseek.com/api-docs/) | deepseek-chat / deepseek-reasoner |
| 千问 (Qwen) | Embedding 模型（text-embedding-v3） |

### 前端 & 文档

| 工具 | 用途 |
|---|---|
| [VitePress](https://vitepress.dev/) | 本项目的文档站点框架 |
| [Mermaid](https://mermaid.live/) | LangGraph 图可视化导出 |

---

## 📖 参考文章

本学习过程参考了以下博主系列教程（`examples/` 下代码的来源）：

| 类别 | 示例目录 | 对应文章 |
|------|----------|----------|
| Tool 工具入门 | `examples/tool-test/` | 博主教程：tool、MCP Server |
| Prompt 模板 | `examples/prompt-template-test/` | 博主教程：Prompt Template 组件化 |
| LCEL 链式组装 | `examples/runnable-test/` | 博主教程：Runnable、LCEL |
| Output Parser | `examples/output-parser-test/` | 博主教程：withStructuredOutput |
| RAG 入门 | `examples/rag-test/` | 博主教程：Loader、Splitter、RAG |
| Memory 记忆 | `examples/memory-test/` | 博主教程：Memory 三大策略 |
| Milvus 向量库 | `examples/milvus-test/` | 博主教程：Milvus CRUD + RAG |
| 简历 RAG | `examples/resume-memory-rag-qa/` | 博主教程：简历 RAG 多版本迭代 |
| TTS/ASR 语音 | `examples/tts-stt-test/` | 博主教程：语音交互 |
| Nest + LangChain | `examples/hello-nest-langchain/` | 博主教程：NestJS 集成 |
| Agentic RAG | `examples/advanced-rag/` | 博主教程：LangGraph 多跳 RAG |
| LangGraph 系统学 | `examples/langgraph-test/` | 博主教程：LangGraph 从图到多智能体 |
| AGUI 协议 | `examples/agui-backend/`、`agui-frontend/` | 博主教程：AGUI + Vercel AI SDK |
| 定时任务 | `examples/cron-job-tool/` | 博主教程：NestJS CronJob |

---

## 🧪 自己的学习产出

除了参考教程，本仓库也积累了大量一手实验记录和复盘文章：

- **`drafts/`** — 各阶段学习记录（60+ 篇），含环境搭建、踩坑排查、对照实验
- **`docs/articles/`** — 30 篇已发表文章，分「Agent 设计模式」和「AI Agent 全栈学习」两个系列
- **`docs/agents/`** — VitePress 知识文档，含 AI 基础概念、Agent 开发、全栈数据库等

---

---

## 🚀 项目实战

学习过程中沉淀的三个核心项目，从 Demo 验证到全栈落地，逐步演进。

### 1. AI-Journey-Fighting

> 📁 [github.com/Fridolph/AI-Journey-Fighting](https://github.com/Fridolph/AI-Journey-Fighting)

**AI 学习旅程的全记录仓库**（即本项目）。从 AI 入门概念 → Agent 设计模式 → 工具使用 → RAG → 多智能体 → 全栈落地，系统梳理 30 篇已发表文章 + 60+ 篇学习记录 + 16 个可运行示例 Demo。配套 VitePress 文档站点，可作为 AI Agent 开发的入门参考。

| 维度 | 说明 |
|------|------|
| 技术栈 | VitePress、LangChain.js、LangGraph、Milvus、ElasticSearch、NestJS |
| 内容 | 15 篇 Agent 设计模式 + 15 篇全栈实战文章 |
| 示例 | 16 个可运行 demo（tool / RAG / memory / Milvus / LangGraph / NestJS / AGUI） |

### 2. resume-memory-rag-qa

> 📁 [github.com/Fridolph/resume-memory-rag-qa](https://github.com/Fridolph/resume-memory-rag-qa)

**简历 RAG 渐进式 Demo 实验仓**。从 v1 到 v7，逐步演进：基础向量召回 → 结构化重排 → 管线化重构 → 证据分层与去噪 → 流式输出。每个版本都保留了独立脚本，适合配合文章阅读和本地运行验证，是 `my-resume` 的 AI 问答能力前置验证项目。

| 维度 | 说明 |
|------|------|
| 技术栈 | Node.js ESM、LangChain.js、Milvus、OpenAI-compatible API |
| 版本 | v1～v7 渐进演进，保留完整历史 |
| 产出 | 7 篇配套学习记录 + 3 篇系列文章 |

### 3. my-resume

> 📁 [github.com/Fridolph/my-resume](https://github.com/Fridolph/my-resume)

**教程型全栈 Monorepo**。从旧版 Vue 简历站重构为 Next.js + NestJS 三端架构（公开端 / 后台 / API），支持 Docker 部署、CI/CD 自动化、AI 工作台。⭐ 34 Stars，是学习全栈工程化 + AI 集成的完整实战项目。

| 维度 | 说明 |
|------|------|
| 技术栈 | Next.js 15、React 19、NestJS 11、Drizzle ORM、SQLite、Tailwind CSS v4 |
| 架构 | pnpm workspace Monorepo（apps/ + packages/ + docs/） |
| 部署 | Docker Compose、GitHub Actions、ECS 自动发布 |
| 在线 | [resume.fridolph.top](https://resume.fridolph.top) |

---

## 🙏 致谢

本项目的学习路线和示例代码主要来自博主 **Miler** 的系列教程。从 AI Agent 设计模式到全栈落地，每一步都有清晰的指引。

> 如果你也想从零开始系统学习 AI Agent 开发，推荐从这两份资料入门：
> - [AlAgent开发要学什么？](https://mp.weixin.qq.com/s/A7M8Dx9Ep_iDOKfVrDRYUg) — 学习路线图
> - [《Agentic Design Patterns》](https://adp.xindoo.xyz) — Agent 设计模式详解
