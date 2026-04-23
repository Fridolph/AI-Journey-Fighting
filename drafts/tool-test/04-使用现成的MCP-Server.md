# 第 04 章：使用现成的 MCP Server

## 这章在讲什么

上一章是自己写 MCP Server，这一章是直接接入别人已经实现好的 MCP Server。  
核心价值：不重复造轮子，用配置把外部能力接到 Agent 上。

## 对应源码

- `examples/tool-test/src/mcp-test.mjs`

## 架构理解

```text
User → LLM → tools
                ├── 普通 Tool（自己写）
                └── MCP Adapter
                        ├── 高德 MCP                 (http)  → 地图 / 路线
                        ├── Chrome DevTools MCP      (stdio) → 浏览器控制
                        └── FileSystem MCP           (stdio) → 文件读写
```

这章对应代码里使用的是 `MultiServerMCPClient`，一次性挂载多个 MCP Server，然后统一通过 `mcpClient.getTools()` 暴露给模型。

## 三个 MCP Server 对比

| MCP Server | 接入方式 | 能力 | 启动方式 |
|---|---|---|---|
| 高德地图 | http | 位置查询、路线规划 | 直接 URL |
| FileSystem | stdio | 读写文件、创建目录 | `npx @modelcontextprotocol/server-filesystem` |
| Chrome DevTools | stdio | 控制浏览器、截图、点击 | `npx chrome-devtools-mcp@latest` |

## 核心代码对应点

### 1) 两种接入方式配置不同

**http（高德）**

```js
"amap-maps-streamableHTTP": {
  "url": "https://mcp.amap.com/mcp?key=" + process.env.AMAP_MAPS_API_KEY
}
```

**stdio（本地子进程）**

```js
"filesystem": {
  "command": "npx",
  "args": [
    "-y",
    "@modelcontextprotocol/server-filesystem",
    ...allowedPaths
  ]
}
```

> `-y` 用于自动确认安装，避免命令卡在交互确认。

### 2) ToolMessage 的 content 必须是字符串

不同 MCP 返回格式可能不同。  
在 `mcp-test.mjs` 里已经做了兼容：

```js
if (typeof toolResult === 'string') {
  contentStr = toolResult;
} else if (toolResult && toolResult.text) {
  contentStr = toolResult.text;
} else {
  contentStr = JSON.stringify(toolResult);
}
```

然后再塞入：

```js
new ToolMessage({
  content: contentStr,
  tool_call_id: toolCall.id,
})
```

重点是：`content` 最终必须是字符串。

### 3) FileSystem 的 ALLOWED_PATHS 安全限制

代码里逻辑是：

```js
const allowedPaths = (process.env.ALLOWED_PATHS || projectRoot)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
```

推荐 `.env` 配置：

```bash
ALLOWED_PATHS=/Users/xxx/Desktop,/Users/xxx/Documents
```

表示 FileSystem MCP 只允许访问这些目录，避免越权读写。

### 4) 用完要关闭 MCP Client

建议在流程结束后执行：

```js
await mcpClient.close();
```

否则 stdio 子进程可能常驻，导致终端不退出。  
当前示例文件里这行是注释状态（`// await mcpClient.close();`），实战时建议启用。

## 推荐运行顺序（排错友好）

1. 先只开高德 MCP  
   - 提问：北京南站附近的酒店  
   - 验证：能返回地理/路线信息
2. 再加 FileSystem MCP  
   - 提问：把路线规划保存为桌面 md  
   - 验证：目标目录出现文件
3. 最后加 Chrome DevTools MCP  
   - 提问：打开酒店图片并分 tab 展示  
   - 验证：浏览器被自动控制

不要一上来三者全开，否则出问题时定位成本很高。

## 本章核心收获

一句话总结：

> MCP 的最大价值是生态复用。  
> 你不必自己实现地图、文件系统、浏览器控制，只要接入现成 MCP Server，就能把能力插到 Agent 上。

## 我的检查清单（实操时）

- MCP 服务是否成功注册（`mcpClient.getTools()` 有返回）
- 每个 tool call 是否能找到对应 `tool.name`
- `ToolMessage.content` 是否最终为字符串
- `ALLOWED_PATHS` 是否配置了实际可写目录
- 结束时是否调用了 `mcpClient.close()`
