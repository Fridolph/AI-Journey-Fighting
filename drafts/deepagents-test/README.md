# deepagents-test — 学习记录

DeepAgents 开箱即用 Middleware 学习专题。

## 学习文件清单

| # | 文件 | 状态 | 日期 |
|---|------|------|------|
| 01 | [DeepAgents Middleware 详解](./01-deepagents-middleware) | ✅ 完成 | 2026-07-30 |

## 示例代码

`examples/deepagents-test/` — 7 个 Middleware 示例：
- `middleware-test.mjs` — 基础 middleware（Logging / AddContext / BlockedContent）
- `middleware-test2.mjs` — Middleware 扩展 Tool + wrapToolCall
- `deepagents/filesystem-agent.mjs` — 文件系统中间件 + 权限控制
- `deepagents/skills-agent.mjs` — Skills 中间件
- `deepagents/subagent-agent.mjs` — 子 Agent 调度中间件
- `deepagents/memory-agent.mjs` — 长期记忆中间件
- `deepagents/summarization-agent.mjs` — 上下文压缩中间件

## 维护记录

| 日期 | 变更 |
|------|------|
| 2026-07-30 | 新增 DeepAgents Middleware 详解学习笔记 |
