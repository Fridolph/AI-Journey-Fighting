# MCP（Model Context Protocol）

## 一句话

**给 AI 工具世界造一个 USB 接口。** 不管工具是谁写的、用什么语言写的，只要支持 MCP 协议，任何 AI 应用都能接入。

## 核心直觉

```
之前：每个 AI 应用都要单独对接每个工具（N×M 的集成噩梦）
      ChatGPT → 自己接 Google Drive、自己接 Slack
      Claude  → 自己接 Google Drive、自己接 Slack

MCP后：工具实现一次 MCP Server，所有 AI 应用都能用
      Google Drive MCP Server ← ChatGPT
      Slack MCP Server        ← Claude
      你的自定义 MCP Server   ← 你的 Agent
```

## 为什么要学

学 Tool 时你写的是「内嵌工具」——工具逻辑和 Agent 代码绑在一起。MCP 把这层解耦了：**工具是独立服务，Agent 通过标准协议调用。**

## 两种角色

| 角色 | 职责 | 例子 |
|------|------|------|
| **MCP Server** | 暴露工具能力（如读文件、查数据库） | 一个 Node 服务，提供 `read_file`、`list_directory` 等工具 |
| **MCP Client** | 发现并调用 MCP Server 的工具 | LangChain Agent 通过 MCP Client 调用上面的 Server |

## 应用场景

| 场景 | 说明 |
|------|------|
| **多 Agent 共享工具** | 天气 Agent、日历 Agent 共用同一个邮箱工具 |
| **企业内部工具集成** | 把公司内部的 API（Jira、Confluence、数据库）统一封装为 MCP Server |
| **开源生态** | 社区贡献的 MCP Server（文件系统、搜索引擎、浏览器自动化等）可以直接拿来用 |

## 优缺点

**优点：** 标准化（一套协议打通所有工具），工具复用（一次开发到处接入），生态增长快
**缺点：** 相对较新（生态不如 REST API 成熟），多一层网络调用（性能开销），调试复杂度增加（工具不在 Agent 代码内）

## 如何选择

> 个人项目、Demo 验证 → 内嵌 Tool 更快。多 Agent、团队协作、生产环境 → MCP 是更好的架构选择。Agent 项目变复杂时，天然会向 MCP 靠拢。

## 小结

MCP 是 Agent 工具生态的「标准化运动」——就像 USB 统一了外设接口。你不需要马上把所有 Tool 都改成 MCP，但理解它的意义：**工具不应该绑死在某个 Agent 上，应该是可复用、可共享的服务。**

## 下一步

- [ReAct](./react.md) — Agent 如何决策调用哪个工具
- [SSE](./sse.md) — MCP 通信常用的传输方式
