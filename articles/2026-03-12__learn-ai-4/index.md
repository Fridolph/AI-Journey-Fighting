---
layout: post
title: 「JS全栈AI Agent学习」四、MCP：给AI工具世界造一个USB接口
date: 2026-03-12 19:00:00
tags:
  - MCP
  - agent
  - 模型上下文协议
  - LangChain.js
  - TypeScript
categories:
  - AI
---

> 📌 **系列简介**：「JS全栈AI Agent学习」系统学习 21 个 Agent 设计模式，篇数随学习进度持续更新。
> ⏱️ **预计阅读时间：15 分钟**
> 📖 **原书地址**：[adp.xindoo.xyz](https://adp.xindoo.xyz/)
> 前端转 JS 全栈，正在学 AI，理解难免有偏差，欢迎批评指正 ~

---

## 🗺️ 系列导航

| 篇 | 主题 | 状态 |
|----|------|------|
| 第一篇 | 提示链 · 路由 · 并行化 | ✅ |
| 第二篇 | 反思 · 工具使用 · 规划 | ✅ |
| 第三篇 | 多智能体 · 记忆管理 · 学习适应 | ✅ |
| **本篇** | **MCP 协议** | ✅ |
| 后续 | 目标监控 · 异常恢复 · RAG · 安全防护…… | 🔜 |

---

## 📖 读这篇，你可以带走什么

| # | 你会学到 | 对应章节 |
|---|---------|---------|
| 1 | 为什么 Tool Use 不够用，MCP 解决了什么 | 一、二 |
| 2 | VSCode 插件 vs MCP——类比哪里对，哪里不够用 | 二 |
| 3 | MCP 协议定义了哪四件事，和 TypeScript 函数签名的关系 | 四 |
| 4 | MCP 三个角色：Client · Server · Transport | 五 |
| 5 | 动态发现 vs 静态注册，这个设计差异意味着什么 | 五 |
| 6 | SSE 流式传输——和你前端写的流式 AI 回复是同一件事 | 六 |
| 7 | 把 PDF Tool 改造成 MCP Server 的完整代码 | 七 |

> 💡 如果你只有 5 分钟，直接看**第五节的三角色架构**和**第七节的代码**，这是这篇最有工程价值的两块。

---

## 前言

我有一个 `my-resume` 项目——最初只是一个静态展示页面，放了简历、项目经历、技术栈。
后来想把它改造成真正的全栈项目：**NestJS 后端 + 数据库 + 前端交互 + AI 能力 + 部署上线**，三端齐备，一条龙。

在这个改造过程中，我开始认真思考 AI 能力怎么集成进来。

第一步，我给项目写了一个读 PDF 的 Tool——用户上传简历 PDF，AI 解析内容，然后做各种分析。
写完挺好用的，但写完之后我意识到一个问题：

> **这个 Tool，只能在我自己的项目里用。**

换个框架要重写，换个 AI 平台要重写，同事想用要复制代码……

这个问题，就是这篇文章的起点。

---

## 一、从一个 PDF Tool 说起

我在 LangChain.js 里注册了一个 PDF 阅读工具，大概长这样：

```typescript
const pdfTool = new DynamicTool({
  name: "read_pdf",
  description: "读取PDF文件并转换为文本，保留原始布局和排版结构。当任务涉及阅读、解析PDF文件内容时触发，仅上传文件不触发。",
  func: async (filePath: string) => {
    return await extractPdfText(filePath);
  }
});
```

Agent 靠 `description` 判断要不要调用这个工具——语义匹配，不是关键词匹配。

这里有个细节值得单独说：**description 写得好不好，直接决定 Agent 调用的精准度**。

> 写不好 description 的时候，不妨问自己：如果这是一份需求文档，你的开发同事会知道什么时候该用这个接口吗？

工具本身没问题。但问题来了——

> 假设不只是我自己用，而是 100 个开发者都需要这个 PDF Tool。
> 假设不只是 LangChain.js，还要支持 Claude、GPT-4、自己搭的 Agent……
> 每个人都要复制代码、手动注册、适配不同框架——

**这个成本，随着工具数量和使用方数量的增加，会指数级爆炸。**

---

## 二、VSCode 插件的类比——以及它哪里不够用

第一反应是：这不就像 **VSCode Extensions** 吗？

VSCode 插件市场解决了类似的问题：
- 开发者按规范写插件，发布到市场
- 用户订阅安装，开箱即用
- 统一管理，不用到处复制代码

这个思路是对的。**规范 + 发布 + 订阅 + 协作**，MCP 都有。

但我多想了一秒，感觉哪里不太对——

VSCode 插件是这样工作的：

```
插件开发者 → 发布到 Marketplace → 用户安装 → VSCode 加载插件
```

**插件运行在哪里？运行在 VSCode 里。VSCode 是唯一的宿主。**

但 AI Tool 的场景完全不同：

> 你的 PDF Tool，可能被 Claude 调用，可能被 GPT-4 调用，可能被你自己用 LangChain.js 写的 Agent 调用。
> 这三个"宿主"，是三个完全不同的系统。

所以需要的不是"插件市场"，而是一个**跨系统的通信协议**。

| | VSCode Extensions | MCP |
|--|------------------|-----|
| 解决什么 | 如何扩展 VSCode 的功能 | 如何让任何 Agent 调用任何工具 |
| 宿主 | 只有 VSCode | Claude / GPT / LangChain / 任何框架 |
| 本质 | 插件规范 | **通信协议** |
| 类比 | 乐高积木的形状规范 | **USB 接口标准** |

> USB 出现之前：鼠标有鼠标接口，键盘有键盘接口，打印机有打印机接口。
> USB 出现之后：**一个接口，接任何设备。**
>
> MCP 就是 AI 工具世界的 USB。

---

## 三、MCP 是什么

**MCP（Model Context Protocol，模型上下文协议）**，是 Anthropic 在 2024 年底提出并开源的一个开放标准。

它要解决的问题，用一张图说清楚：

```
MCP 出现之前：
─────────────────────────────────────────
PDF Tool (Claude版)    ──→ Claude
PDF Tool (OpenAI版)    ──→ GPT-4
PDF Tool (LangChain版) ──→ 你的 Agent
同一个功能，写三遍

MCP 出现之后：
─────────────────────────────────────────
                       ──→ Claude
PDF Tool (MCP版) ────────→ GPT-4
                       ──→ 你的 Agent
写一次，到处用
```

一句话定义：**MCP 是 AI 工具世界的 USB 接口标准——工具只写一次，任何兼容 MCP 的 Agent 都能调用。**

---

## 四、MCP 协议定义了什么

既然是"通信协议"，那它需要定义哪些东西，两端才能"说上话"？

类比 HTTP 协议：它定义了请求方法（GET/POST）、状态码（200/404）、Header 格式……

MCP 对应地定义了四件事：

| 你的直觉推导 | MCP 里的概念 | 说明 |
|-------------|-------------|------|
| 支持哪些平台/连接方式 | **Transport 层** | 定义通信方式，解决"怎么连上" |
| 名称和描述 | **Tool Definition** | `name` + `description`，Agent 靠这个决定要不要调用 |
| 怎么使用（说明书） | **Input Schema** | 用 JSON Schema 定义入参，Agent 知道要传什么 |
| 备注/版本/返回格式 | **Output Schema / Metadata** | 返回值格式、版本号、错误码定义 |

真实的 MCP Tool 定义长这样：

```typescript
{
  name: "read_pdf",
  description: "读取PDF文件并转换为文本，保留原始布局和排版结构",
  inputSchema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "PDF文件的路径"
      },
      pageRange: {
        type: "string",
        description: "可选，指定页码范围，如 '1-5'"
      }
    },
    required: ["filePath"]
  }
}
```

看到这个结构，有没有觉得很眼熟？

这和写 TypeScript 函数签名，本质上是同一件事：

```typescript
// TypeScript 函数签名
function readPdf(filePath: string, pageRange?: string): string { ... }

// MCP inputSchema = 把函数签名用 JSON 描述出来，让 Agent 能"读懂"
```

**MCP 的 inputSchema，就是把函数类型定义翻译成 Agent 可以理解的格式。**

---

## 五、MCP 架构：三个角色

MCP 基于客户端-服务器架构，有三个核心角色：

```
你的 Agent（MCP Client）
      │
      │  ① 发现：这里有哪些工具？
      ▼
 MCP Server（工具提供方）
      │
      │  ② 返回：工具列表 + 每个工具的 Schema
      ▼
你的 Agent 决策：
  "这个任务需要用 read_pdf"
      │
      │  ③ 调用：传入参数
      ▼
 MCP Server 执行工具
      │
      │  ④ 返回结果
      ▼
Agent 继续处理
```

| 角色 | 是什么 | 类比 |
|------|--------|------|
| **MCP Client** | 你的 Agent，发起调用方 | 浏览器 |
| **MCP Server** | 工具提供方，暴露工具能力 | Web 服务器 |
| **Transport 层** | 两者之间的通信方式 | HTTP / WebSocket |

这里有一个值得单独说的设计细节：

> **第 ① 步是"发现"，不是"被告知"。**

传统的 Tool Use，是你在代码里明确告诉 Agent："你有这些工具"——静态注册，写死在代码里。

MCP 的方式是 Agent 主动去问 Server："你有什么工具？"——**动态发现，运行时查询。**

这个差异的实际意义是：MCP Server 可以独立部署、独立更新，Agent 不需要改一行代码，就能感知到工具的变化。工具加了新功能、下线了旧接口，Agent 侧完全无感。

---

## 六、Transport 层：同步等待，还是流式返回？

三个角色清楚了，还有一个问题没解决：**Agent 调用工具，该怎么等结果？**

读 PDF 可能要几秒，查数据库可能要几百毫秒，调用外部 API 可能更慢。
如果 Agent 傻等，整个系统就卡住了。

最理想的设计是：**既能根据情况异步请求，也能支持同步读取，最后统一输出。**

这在计算机里有个专门的名字：**流式响应（Streaming）**。

MCP 定义了两种标准传输方式：

```
方式一：stdio（标准输入输出）
─────────────────────────────────────────
Agent ──写入 stdin──▶ MCP Server
Agent ◀──读取 stdout── MCP Server

适合：本地工具，同一台机器上运行
类比：命令行管道  ls | grep pdf


方式二：HTTP + SSE（Server-Sent Events）
─────────────────────────────────────────
Agent ──HTTP POST──▶ MCP Server
Agent ◀──SSE 流式──── MCP Server

适合：远程工具，跨网络调用
类比：流式 AI 回复
```

SSE 的工作方式，画出来是这样的：

```
Agent 发出请求 ──────────────────────────▶ MCP Server
                                               │
                                          开始执行工具
                                               │
                ◀── 流式返回（边处理边推送）──── │
                ◀── 流式返回 ────────────────── │
                ◀── 流式返回 ────────────────── │
                ◀── [DONE] ──────────────────── │

Agent 不需要傻等，数据来一点处理一点，最后统一完成
```

做过前端 AI 应用的同学，这个原理一眼就熟——

> 你在页面上做的**流式渲染 AI 回复**，用的就是同一套机制：
> `ReadableStream` → 一块一块读 → 渲染到页面

**MCP 的 SSE 传输，和你前端写的流式 AI 回复，本质上是同一件事。**

---

## 七、动手：把 PDF Tool 升级成 MCP Server

理论讲完，直接上代码。

把 `my-resume` 项目里的 PDF Tool，改造成一个标准的 MCP Server：

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// 创建 MCP Server 实例
const server = new Server({
  name: "resume-tools",   // 工具集名称
  version: "1.0.0",       // 版本号
});

// ① 声明工具列表
// Agent 来问"你有什么工具"时，返回这个
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "read_pdf",
      description:
        "读取PDF文件并转换为文本，保留原始布局和排版结构。" +
        "当任务涉及阅读、解析PDF内容时触发，仅上传文件不触发。",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "PDF文件路径",
          },
          pageRange: {
            type: "string",
            description: "可选，页码范围，如 '1-5'",
          },
        },
        required: ["filePath"],
      },
    },
  ],
}));

// ② 处理工具调用
// Agent 决定调用某个工具时，走这里
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "read_pdf") {
    const { filePath, pageRange } = request.params.arguments as {
      filePath: string;
      pageRange?: string;
    };

    const result = await extractPdfText(filePath, pageRange);

    return {
      content: [{ type: "text", text: result }],
    };
  }

  throw new Error(`未知工具: ${request.params.name}`);
});

// ③ 启动（stdio 模式，本地调用）
const transport = new StdioServerTransport();
await server.connect(transport);
console.log("MCP Server 已启动，等待 Agent 连接...");
```

看这个结构，有没有觉得很像你写 **NestJS Controller**？

```
NestJS：  @Controller → @Get/@Post         → 处理请求 → 返回响应
MCP：      Server     → ListTools/CallTool → 处理请求 → 返回结果
```

这个类比不是巧合——两者解决的是同一类问题：**定义接口、处理请求、返回结果**。只是服务的对象从"HTTP 客户端"变成了"AI Agent"。

### 关于 my-resume 项目的思考

在 `my-resume` 的全栈改造里，MCP 的三个角色可以这样对应：

```
MCP Server = 我写的工具层（NestJS 后端）
  → read_pdf：解析用户上传的简历 PDF
  → get_resume_data：从数据库读取结构化简历数据
  → search_projects：搜索项目经历

MCP Client = 调用工具的 Agent（前端发起，后端编排）
  → 接收用户指令："帮我优化这段工作经历"
  → 决策：先调用 get_resume_data 拿到原始数据
  → 再交给 LLM 处理，返回优化建议

Transport = stdio（本地）或 HTTP+SSE（部署后远程调用）
```

**Server 提供能力，Client 使用能力，Transport 是中间的管道。**

这个分层思路，和 NestJS 的 Controller / Service / Repository 分层，逻辑上是一脉相承的。

---

## 八、MCP vs 工具函数调用：别混淆

学到这里，有一个容易混淆的地方值得单独说清楚。

MCP 和 LangChain 里的 Tool Use（工具函数调用）看起来很像，但有本质区别：

| 特性 | 工具函数调用（Tool Use） | MCP |
|------|------------------------|-----|
| 标准化 | 各平台专有，格式不统一 | 开放标准，跨平台互通 |
| 工具发现 | 你明确告诉 Agent 有哪些工具 | Agent 主动查询，动态发现 |
| 可重用性 | 与特定应用/框架耦合 | 独立部署，任何兼容方都能用 |
| 架构 | 一对一（LLM ↔ 工具） | 客户端-服务器（多对多） |

一句话区分：

> **工具函数调用** = 给 AI 一套专用工具箱，工具是定制的，只能在这个项目里用。
> **MCP** = 造一个标准插座，任何符合规格的工具都能插进来，任何兼容的 Agent 都能用。

---

## 九、核心洞察

| 洞察 | 一句话 |
|------|--------|
| MCP 是什么 | AI 工具世界的 USB 接口标准 |
| 解决什么问题 | 工具只写一次，任何 Agent 都能用 |
| 三个角色 | Client（Agent）· Server（工具）· Transport（通道） |
| 两种传输 | stdio（本地）· HTTP+SSE（远程+流式） |
| 和 VSCode 插件的本质区别 | 插件规范 vs 跨系统通信协议 |
| 和 NestJS 的类比 | Controller/Service 分层 ≈ Server/Handler 分层 |
| 你已经在用的类似概念 | 流式 AI 回复的 ReadableStream |
| 动态发现 vs 静态注册 | MCP 让 Agent 主动问"你有什么"，而不是被动被告知 |

---

## 结语

MCP 这章，我觉得是目前为止最"工程感"的一章。

它不是一个新的 AI 能力，而是一个**工程规范**——解决的是"怎么让 AI 能力可复用、可组合、可跨平台"这个问题。

对于 `my-resume` 全栈改造来说，这章给了我一个很清晰的架构思路：

> **不要把 AI 工具写死在业务代码里。把它们抽成 MCP Server，独立部署，独立维护。**
> 今天接 Claude，明天换 GPT-4，后天自己搭 Agent——工具层一行代码不用改。

这个思路，和后端开发里"接口与实现分离"是同一个道理。只不过现在，接口的调用方从"前端页面"变成了"AI Agent"。

学到这里，越来越觉得：**AI 工程和软件工程，底层是同一套思维。** 分层、解耦、标准化——这些事工程师早就在做了，只不过现在的场景换了。

---

> 💬 **系列地址**：持续更新中
> 📖 **原书地址**：[adp.xindoo.xyz](https://adp.xindoo.xyz/)
> 🛠️ **实战项目**：my-resume（静态页面 → NestJS + 数据库 + AI + 部署上线，进行中）
>
> 如果这篇对你有帮助，欢迎点赞收藏，我们下篇见 👋