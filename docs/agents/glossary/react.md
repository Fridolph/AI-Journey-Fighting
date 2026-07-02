# ReAct（推理-行动模式）

## 一句话

**让 LLM 边想边做。** Think（推理下一步要做什么）→ Act（调工具）→ Observe（看结果）→ Think again，直到能给出最终答案。

## 核心循环

```
Thought: 我需要知道杭州今天的天气 → 调用 lookup_weather
Action:  lookup_weather("杭州")
Observation: { summary: "多云转小雨", temp: 15-22°C }
Thought: 已经拿到天气数据，可以回答了 → 不需要更多工具
Answer: 杭州今天多云转小雨，气温 15-22°C
```

## 为什么重要

ReAct 是**所有现代 AI Agent 的底层思维模型**。LangChain 的 AgentExecutor、LangGraph 的 ToolNode、OpenAI 的 Function Calling——底层都是 ReAct 模式。

## 横向对比

| | 纯 LLM | ReAct Agent |
|---|---|---|
| 外部信息 | 只能靠训练数据记忆 | 可以实时调用工具获取 |
| 多步骤推理 | 靠 prompt 引导 | 原生的 Think→Act→Observe 循环 |
| 事实准确性 | 可能幻觉 | 工具返回事实，幻觉大幅降低 |
| 可解释性 | 黑箱 | 每一步的 Thought/Action/Observation 都可追溯 |

## 优缺点

**优点：** 赋予 LLM 行动能力，思维链可追溯（你知道它在每一步「想了什么」），通过工具调用降低幻觉
**缺点：** 需要多轮 LLM 调用（成本高、速度慢），Thought 的质量决定 Agent 表现（有时它「想歪了」），循环可能死锁或无限调用工具

## 小结

ReAct 是 AI Agent 的「骨骼」——理解了 Think→Act→Observe 的循环，你就理解了所有 Agent 框架的共同本质。它不是某一个库的 API，而是一种**设计范式**。

## 下一步

- [Agentic RAG](./agentic-rag.md) — ReAct 模式在检索场景的应用
- [MCP](./mcp.md) — Agent 调用工具的标准化协议
