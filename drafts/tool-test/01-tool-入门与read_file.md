# 第 01 章：Tool 入门与 `read_file`

## 本章目标

- 理解大模型为什么“会回答，但不会直接帮你做事”
- 理解 Tool 的作用：给大模型扩展外部能力
- 学会用 LangChain 定义一个最简单的文件读取工具
- 理解消息流转：用户消息 -> 模型决定调工具 -> 工具执行 -> 结果回传模型

## 对应源码

- `tool-test/src/hello-langchain.mjs`
- `tool-test/src/tool-file-read.mjs`

## 本章主线

### 1. 先调用大模型

`hello-langchain.mjs` 做的事情很简单：

- 用 `dotenv` 读取环境变量
- 创建 `ChatOpenAI` 实例
- 调用 `model.invoke("介绍下自己")`
- 输出模型返回内容

这一步的意义是先确认两件事：

- 模型接口能正常连通
- LangChain 的基础调用方式已经跑通

## 关键代码理解

### 1. 模型初始化

在 `tool-test/src/hello-langchain.mjs` 里：

- `dotenv.config()`：读取 `.env`
- `modelName`：指定模型名
- `apiKey`：指定模型服务密钥
- `configuration.baseURL`：指定兼容 OpenAI 协议的接口地址

这里的 `ChatOpenAI` 不代表只能连 OpenAI 官方。
只要服务端兼容 OpenAI 的接口格式，就可以接入。

所以原文用千问，你现在改成七牛代理层，也是完全可行的。

### 2. 定义 Tool

在 `tool-test/src/tool-file-read.mjs` 里，`readFileTool` 是这样定义的：

- 核心函数：真正执行读取文件
- `name`：工具名称，供模型选择调用
- `description`：告诉模型什么时候该用这个工具
- `schema`：用 `zod` 描述入参格式

这里的 `schema` 非常重要，因为模型不是直接看你函数签名，而是通过 schema 理解：

```json
{
  "filePath": "xxx"
}
```

也就是说，模型知道如果它想调用 `read_file`，就必须传一个对象，里面有一个字符串类型的 `filePath`。

### 3. 把 Tool 绑定给模型

`const modelWithTools = model.bindTools(tools);`

这一步的作用是把工具列表暴露给模型。

从这一刻开始，模型在回复用户时，不只是“生成文本”，还可以决定：

- 直接回答
- 或者先发起一次工具调用

### 4. 用消息告诉模型该怎么工作

这里用了四类消息：

- `SystemMessage`：定义 AI 身份、能力、行为规范
- `HumanMessage`：用户输入
- `AIMessage`：模型回复
- `ToolMessage`：工具调用结果

这一章的 `SystemMessage` 里明确规定了工作流程：

1. 用户要读取文件时，先调用 `read_file`
2. 等工具返回
3. 再根据文件内容解释代码

这一步很像给 Agent 设定“工作 SOP”。

### 5. 检测模型是否要调工具

第一次执行：

```js
let response = await modelWithTools.invoke(messages);
```

这次返回的未必是最终答案。

如果模型判断“我需要先读取文件”，那么它会在 `response.tool_calls` 里放入要调用的工具信息。

这就是 Agent 和普通问答的关键区别之一：

- 普通问答：模型直接输出文本
- Agent 模式：模型先规划一步动作，再等待宿主程序执行

### 6. 真正执行工具的是宿主代码

这一点要特别注意：

不是模型自己去读文件。

真正执行 `fs.readFile` 的，是你的 Node.js 程序。

宿主程序做的事情是：

- 遍历 `response.tool_calls`
- 根据工具名在 `tools` 数组里找到对应工具
- 把模型解析出的参数传进去
- 得到执行结果

也就是说：

模型负责“决定用哪个工具、传什么参数”，
你的程序负责“真正把工具执行掉”。

### 7. 把工具结果回传给模型

工具执行完成后，需要包装成 `ToolMessage` 再塞回消息历史里。

其中最关键的是：

- `tool_call_id` 必须对应本次工具调用的 id

这相当于告诉模型：

- 你刚才发起的这次工具调用
- 结果在这里

然后再执行一次：

```js
response = await modelWithTools.invoke(messages);
```

这时候模型才能结合工具结果给出最终解释。

## 为什么这就是 Cursor 的雏形

Cursor 之所以能：

- 读文件
- 写文件
- 搜索目录
- 执行命令
- 修改代码

本质上就是因为它背后有一组工具。

大模型本身不会直接操作你的电脑，
它只是根据上下文判断应该调哪个工具。

所以这一章虽然只实现了 `read_file`，
但它已经搭起了 Agent 的最小闭环。

## 你的环境和原文的差异

原文里是：

- 千问
- `.env`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `MODEL_NAME`

你当前本地是：

- 七牛兼容层
- `.env.local`
- `QINIU_AI_API_KEY`
- `QINIU_AI_BASE_URL`
- `QINIU_AI_MODEL`

这说明你做了一层“提供商抽象”的思路，这是对的。

但要注意：

- 当前这两个示例源码默认读取的是 `.env`
- 当前示例源码默认读取的是 `OPENAI_*` / `MODEL_NAME`

所以如果不改代码，直接运行时，未必能正确吃到你现在的 `.env.local` 配置。

## 本章知识点总结

- `ChatOpenAI` 可以接兼容 OpenAI 协议的第三方模型服务
- Tool = 函数 + 名称 + 描述 + 参数 schema
- `zod` 负责声明工具参数格式
- `bindTools` 负责把工具暴露给模型
- `tool_calls` 表示模型决定先调工具
- Tool 不会自动执行，真正执行它的是宿主程序
- 工具结果要通过 `ToolMessage` 回传给模型
- `tool_call_id` 用来关联“哪次调用”与“对应结果”

## 易错点

- 误以为模型本身能直接操作本地文件
- 误以为定义了 Tool 就会自动执行
- 忽略 `tool_call_id`，导致模型拿不到正确的工具返回
- 把工具描述写得太模糊，导致模型不知道什么时候该调用
- 环境变量文件和代码读取逻辑不一致

## 你可以这样理解这一章

一句话总结：

> 大模型负责决策，工具负责执行，宿主程序负责衔接。

## 本章可继续延伸的问题

- 如果要实现写文件工具，schema 应该怎么设计？
- 如果要执行命令工具，如何限制危险命令？
- 如果一个问题需要多个工具串联，消息历史怎么维护？
- 如果工具执行失败，应该如何把错误返回给模型？

## 我的补充理解

这一章最值得记住的不是某个 API，而是 Agent 的运行模式。

后面你再学：

- 写文件
- 执行命令
- 搜索目录
- 多工具协作
- MCP

基本都是在这个模式上不断扩展。

