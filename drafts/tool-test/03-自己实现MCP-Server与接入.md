# 第 03 章：自己实现 MCP Server 与接入

## 本章目标

- 理解 MCP Server 端如何声明 Tool 和 Resource
- 理解 MCP Client 如何接入本地 MCP Server（stdio）
- 跑通“自定义 MCP 能力 → Agent 调用”的完整闭环
- 识别并复盘 `maxIterations` 的课程代码 bug

## 对应源码

- `examples/tool-test/src/my-mcp-server.mjs`
- `examples/tool-test/src/langchain-mcp-test.mjs`

## 本章主线

这一章做的事可以拆成两半：

1. **自己写 MCP Server**（`my-mcp-server.mjs`）
2. **在 LangChain 里当成工具接入**（`langchain-mcp-test.mjs`）

最终效果是：模型可以通过自然语言自动调用你定义的 MCP 工具（例如查用户）。

## 关键代码理解

### 1) MCP Server 端：注册 Tool 与 Resource

在 `my-mcp-server.mjs` 中：

- 用 `McpServer` 创建服务实例
- 用 `registerTool` 注册 `query_user`
- 用 `registerResource` 注册 `docs://guide`
- 最后通过 `StdioServerTransport` 暴露服务

也就是说，MCP 不只支持“可执行工具”，还支持“可读取资源”。

### 2) MCP Client 端：挂载本地 stdio 服务

在 `langchain-mcp-test.mjs` 中：

- `MultiServerMCPClient` 配置 `command: "node"` + `args: [".../my-mcp-server.mjs"]`
- `mcpClient.getTools()` 把 MCP Tools 拉出来
- `model.bindTools(tools)` 绑定给模型

这样模型就具备了访问你自定义后端能力的入口。

### 3) Resource 注入 SystemMessage

代码里还做了一个很实用的动作：

- 先 `listResources()`
- 再 `readResource()`
- 把资源文本拼进 `SystemMessage`

这让模型在开局就拥有“服务说明文档”上下文，减少乱调用。

## 重点复盘：`maxIterations` 超限 bug（本章关键收获）

你提出的问题非常关键：  
当前课程代码在超出最大迭代后，直接返回最后一条消息 `content`：

```js
return messages[messages.length - 1].content;
```

但最后一条很可能是“还要继续调工具”的 `AIMessage`（`tool_calls` 存在，`content` 为空字符串）。  
结果就是：**任务失败却静默返回空字符串**，调用方完全不知道发生了什么。

### 为什么这是 bug

- 失败状态没有显式暴露
- 调用方无法区分“成功空结果”还是“迭代耗尽失败”
- 线上会造成难排查的“偶发空响应”

### 可选修复策略

1. **直接抛错**：超限即抛异常，最明确
2. **最后一轮强制收尾**：提示模型“不要再调工具，直接给最终答案”
3. **返回结构化结果（推荐生产）**：`success / content / iterations / error`

你的总结非常准确：

> 课程代码里超出 `maxIterations` 后会静默返回空字符串，这是个 bug。  
> 生产环境应明确抛错或强制收尾，让调用方知道任务未完成。

## 为什么一定要有 `maxIterations`

它是 Agent 的安全阀，用来防止：

- 模型死循环反复调工具
- 工具结果一直“不满足”导致无限迭代
- 复杂任务长时间阻塞并持续烧 Token

## 本章易错点

- 服务端路径写死到本机目录，换机后失效
- 忘记处理工具失败分支，导致对话卡住
- 没有在结束时 `await mcpClient.close()`
- 超限后仍返回不透明结果（本章 bug）

## 一句话总结

> 第 3 章让你掌握了“自己造 MCP 能力并接入 Agent”的完整链路；同时也意识到 Agent 循环必须有明确失败语义，不能静默吞错。

