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

## 学习建议

1. **不要只是读文章**——每篇文章都关联了可运行的代码，跑一遍比看十遍更有效
2. **按顺序学**——01-03 是构建 AI Agent 的三大基石，04-06 是工程化和生产部署
3. **关注"为什么"而不是"怎么用"**——每个设计决策背后都有踩坑和迭代，理解"为什么这样做"比记住 API 更有价值
