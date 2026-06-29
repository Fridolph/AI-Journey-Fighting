# langgraph-test — 学习记录

LangGraph 系统学习专题，从基础图 → 条件路由 → 持久化 → 中断恢复 → 多智能体。

## 学习文件清单

| # | 文件 | 状态 | 日期 |
|---|------|------|------|
| 概览 | [01-LangGraph系统学习概览](./01-LangGraph系统学习概览) | ✅ 完成 | — |
| 01 | [basic-graph — 第一个 LangGraph 图](./01-basic-graph) | ✅ 完成 | 2026-05-21 |
| 02 | [conditional-routing — 条件路由入门](./02-conditional-routing) | ✅ 完成 | 2026-05-21 |
| 03 | [loop-retry — 回边与循环](./03-loop-retry) | ✅ 完成 | 2026-05-21 |
| 04 | [checkpointer-memory — 状态持久化与会话隔离](./04-checkpointer-memory) | ✅ 完成 | 2026-05-21 |
| 05 | [graph-interrupt — Human-in-the-Loop](./05-graph-interrupt) | ✅ 完成 | 2026-05-21 |
| 06 | [graph-interrupt-pro — 转账实战组合](./06-graph-interrupt-pro) | ✅ 完成 | 2026-05-21 |
| 07 | [prebuilt-agent — 白盒与黑盒](./07-prebuilt-agent) | ✅ 完成 | 2026-05-21 |
| 08 | [multi-agent-supervisor — 调度员模式](./08-multi-agent-supervisor) | ✅ 完成 | 2026-05-21 |
| 09 | checkpointer-sqlite — SQLite 持久化 | ⬜ 待学习 | — |
| 10 | multi-agent-pro-1 — 多 Agent 串行编排 | ⬜ 待学习 | — |
| 11 | multi-agent-pro-2 — 多 Agent 混合编排 | ⬜ 待学习 | — |
| 总结 | [阶段总结 — 从图到 Agent](./09-阶段总结-从图到Agent) | ✅ 草稿 | 2026-05-21 |

## 学习版源文件

| 文件 | 说明 |
|------|------|
| `src/basic-graph-learning.mjs` | basic-graph 中文注释版 |
| `src/conditional-routing-learning.mjs` | conditional-routing 中文注释版 |
| `src/loop-retry-learning.mjs` | loop-retry 中文注释版 |
| `src/checkpointer-memory-learning.mjs` | checkpointer-memory 中文注释版 |
| `src/graph-interrupt-learning.mjs` | graph-interrupt 中文注释版 |
| `src/graph-interrupt-pro-learning.mjs` | graph-interrupt-pro 中文注释版 |
| `src/graph-interrupt-pro-fix.mjs` | graph-interrupt-pro 空输入修复版 |
| `src/prebuilt-agent-fix.mjs` | prebuilt-agent 黑盒修复版（createReactAgent） |
| `src/multi-agent-supervisor-fix.mjs` | multi-agent-supervisor 修复版（stream 流式输出） |

## 维护记录

| 日期 | 变更 |
|------|------|
| 2026-05-21 | 新增 01-basic-graph 学习笔记 + learning 注释版 |
| 2026-05-21 | 新增 02-conditional-routing 学习笔记 + learning 注释版 |
| 2026-05-21 | 新增 03-loop-retry 学习笔记 + learning 注释版 |
| 2026-05-21 | 新增 04-checkpointer-memory 学习笔记 + learning 注释版 |
| 2026-05-21 | 新增 05-graph-interrupt 学习笔记 + learning 注释版 |
| 2026-05-21 | 新增 06-graph-interrupt-pro 学习笔记 + learning 注释版（前半程集大成） |
| 2026-05-21 | graph-interrupt-pro-fix 新增降级跳过增强（3 次空输入自动跳过） |
| 2026-05-21 | 新增 07-prebuilt-agent 学习笔记 + fix 版（白盒黑盒机制） |
| 2026-05-21 | 新增 08-multi-agent-supervisor 学习笔记 + fix 版（4 处修复、stream 流式输出改造、supervisor 流程深度解析） |
| 2026-05-21 | 新增阶段总结草稿「从一条线到调度员」 |
