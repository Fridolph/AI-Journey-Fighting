# Agent 开发实战笔记

基于真实项目代码的 AI Agent 开发系列，从概念到落地，从脚本到生产服务。

## 学习路线

本系列按**由浅入深的工程实践**组织，建议按顺序阅读：

| 序号 | 文章 | 核心主题 |
|------|------|---------|
| 01 | [从 Prompt 到 Tool：构建能真正做事的 AI 智能体](./01-prompt-to-tool.md) | Prompt 模板化 → Output Parser → Tool Calling |
| 02 | [Agent 的记忆系统：History 与三大策略](./02-agent-memory.md) | 短时/长时记忆 → 截断/总结/检索 |
| 03 | [RAG 检索增强生成：从原理到 Milvus 实战](./03-rag-milvus.md) | RAG 原理 → Loader/Splitter → Milvus → ChunkSize 调参 |
| 04 | [简历 RAG 七次迭代：一个真实项目的完整进化](./04-resume-rag-iterations.md) | v1 字段拆分 → v7 跨区补证，完整工程进化 |
| 05 | [LCEL 声明式链式组装：把逻辑变成拼图](./05-lcel-runnable.md) | pipe/bind/Map/Branch/Retry/Fallback 全组件 |
| 06 | [NestJS 集成 LangChain：从脚本到生产服务](./06-nestjs-langchain.md) | SSE 流式 → Agent Loop → Tool DI → 定时任务 |

### LangGraph 专题（07-12）

| 序号 | 文章 | 核心主题 |
|------|------|---------|
| 07 | [LangGraph 热身：从图开始理解](./07-langgraph-warmup.md) | StateGraph 三原语 — State / Node / Edge |
| 08 | [LangGraph 学习笔记（二）：从图到代码](./08-langgraph-code.md) | 条件路由 → 循环重试 → checkpointer 持久化 |
| 09 | [LangGraph 学习笔记（三）：interrupt 暂停机制](./09-langgraph-interrupt.md) | interrupt() → Command() → Human-in-the-Loop |
| 10 | [LangGraph 学习笔记（四）：prebuilt Agent 深度拆解](./10-langgraph-prebuilt-agent.md) | ToolNode / toolsCondition / createAgent 白盒黑盒对比 |
| 11 | [LangGraph 学习笔记（五）：Multi-Agent Supervisor](./11-langgraph-multi-agent.md) | createSupervisor → 单步/串行调度 → 子 Agent 隔离 |
| 12 | [LangGraph 学习笔记（六）：Multi-Agent 架构对比与实战](./12-langgraph-architecture-compare.md) | Supervisor vs 手动编排 vs 混合并行，三种架构优劣 |

### 进阶实战（13-17）

| 序号 | 文章 | 核心主题 |
|------|------|---------|
| 13 | [TTS 与 ASR：给 AI Agent 装上嘴巴和耳朵](./13-tts-stt.md) | 腾讯云 TTS/ASR → WebSocket 流式语音 → 完整语音 Agent 链路 |
| 14 | [AGUI 协议：流式组件渲染](./14-agui.md) | Vercel AI SDK + LangChain → 结构化 JSON 流 → Tool 组件面板 |
| 15 | [Docker Compose：开发与生产部署](./15-docker-deploy.md) | 镜像/容器/Dockerfile → 多阶段构建 → 开发/生产 compose 编排 |
| 16 | [ElasticSearch 全文检索：倒排索引 + IK 分词 + BM25](./16-es-fulltext.md) | 倒排索引 → IK 分词器 → BM25 打分 → 混合检索 + Rerank |
| 17 | [Neo4j 知识图谱 + GraphRAG](./17-neo4j-graphrag.md) | Cypher 基础 → 多跳推理 → Text-to-Cypher → GraphRAG |

### 阶段总结（18）

| 序号 | 文章 | 核心主题 |
|------|------|---------|
| 18 | [LangChain 学习总结：AI Agent 第一阶段学习完成](./18-langchain-summary.md) | 七大组件回顾（ChatModel/Prompt/Parser/Tool/Memory/RAG/LCEL） |

## 项目代码

所有文章引用代码位于 `examples/` 目录下：

| 目录 | 对应文章 |
|------|---------|
| `examples/prompt-template-test/` | 01 篇 |
| `examples/output-parser-test/` | 01 篇 |
| `examples/tool-test/` | 01 篇 |
| `examples/memory-test/` | 02 篇 |
| `examples/rag-test/` | 03 篇 |
| `examples/milvus-test/` | 03 篇 |
| `examples/resume-memory-rag-qa/` | 04 篇 |
| `examples/runnable-test/` | 05 篇 |
| `examples/hello-nest-langchain/` | 06 篇 |
| `examples/cron-job-tool/` | 06 篇 |
| `examples/langgraph-test/` | 07-12 篇 |
| `examples/advanced-rag/` | 03 / 12 篇 |
| `examples/tts-stt-test/` | 13 篇 |
| `examples/agui-backend/`、`agui-frontend/` | 14 篇 |
| `examples/nest-dockerfile-test/` | 15 篇 |
| `examples/es-test/` | 16 篇 |
| `examples/neo4j-graphrag/` | 17 篇 |

## 学习建议

1. **不要只是读文章**——每篇文章都关联了可运行的代码，跑一遍比看十遍更有效
2. **按顺序学**——01-06 是 Agent 开发基石，07-12 是 LangGraph 从入门到多智能体，13-17 是语音/协议/部署/检索/图谱等进阶能力，18 是阶段总结
3. **关注"为什么"而不是"怎么用"**——每个设计决策背后都有踩坑和迭代，理解"为什么这样做"比记住 API 更有价值
