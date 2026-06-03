# 从 Prompt 到 Tool：构建能真正做事的 AI 智能体

## 开篇

很多人第一次用大模型，体验是这样的：

```js
const response = await model.invoke('帮我写一封周报邮件')
console.log(response.content)
```

能跑，能用，但这就是全部了吗？

随着需求变复杂，你会发现几个问题：
1. **prompt 越来越长**，角色、背景、任务、格式全部混在一起，改一处可能动全局
2. **输出格式不稳定**，有时返回纯文本，有时返回 JSON，有时在 JSON 外面还包了一层 markdown 代码块
3. **模型只会说不会做**——它能告诉你"应该发邮件"，但它发不了邮件

这三个问题，正好对应了 AI Agent 开发的第一道门槛。这篇文章，我们沿着 Prompt 模板化 → Output Parser 结构化 → Tool 调用这条主线，用实际代码把它讲清楚。

> 文中代码全部来自 `examples/` 目录下的实战项目，可以直接跑。

---

## 一、Prompt Template：把字符串拼装升级为组件化

### 从硬编码说起

最朴素的写法是这样：

```js
const prompt = `
你是一名资深工程团队负责人。
公司：星航科技
部门：数据智能平台组
请根据以下工作内容写一份周报：开发了数据看板、修复了 3 个线上 bug
`
```

能跑，但问题也很明显——换一个人、换一个部门、换一项工作内容，就要重新拼字符串。

### PromptTemplate：变量分离

```js
import { PromptTemplate } from '@langchain/core/prompts'

const template = PromptTemplate.fromTemplate(`
你是一名{role}，写作风格：{tone}。
公司：{company_name}
部门：{team_name}
请根据以下内容写一份{report_type}：
{activities}
`)

const prompt = await template.format({
  role: '资深工程团队负责人',
  tone: '专业简洁',
  company_name: '星航科技',
  team_name: '数据智能平台组',
  report_type: '周报',
  activities: '开发了数据看板、修复了 3 个线上 bug',
})
```

代码位置：`examples/prompt-template-test/src/prompt-template1.mjs`

核心理解：`fromTemplate()` 自动识别 `{变量名}` 为 `inputVariables`，`format()` 用 key-value 填充。同一模板可以换不同数据生成不同 prompt。

### PipelinePromptTemplate：拆分成可复用模块

当 prompt 变长后，更好的做法是拆分成独立模块：

```js
// persona.js —— 复用：角色设定
export const personaPrompt = PromptTemplate.fromTemplate(
  `你是一名{role}，写作风格：{tone}`
)

// context.js —— 复用：上下文信息
export const contextPrompt = PromptTemplate.fromTemplate(
  `公司：{company_name}\n部门：{team_name}`
)

// task.js —— 当前任务（每次都不同）
const taskPrompt = PromptTemplate.fromTemplate(
  `请根据以下内容写一份{report_type}：{activities}`
)
```

然后用 `PipelinePromptTemplate` 把它们串联起来：

```js
import { PipelinePromptTemplate } from '@langchain/core/prompts'

const pipelinePrompt = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: 'persona_block', prompt: personaPrompt },
    { name: 'context_block', prompt: contextPrompt },
    { name: 'task_block',    prompt: taskPrompt },
  ],
  finalPrompt: PromptTemplate.fromTemplate(
    `{persona_block}\n{context_block}\n{task_block}`
  ),
})
```

代码位置：`examples/prompt-template-test/src/pipeline-prompt-template.mjs`

这样做的好处：**人设模块和背景模块可以被不同的任务复用**。比如同一个 persona，既可以写周报，也可以写季度 OKR 回顾——你不需要重复定义"你是谁"。

### 更深一层：ChatPromptTemplate 和 MessagesPlaceholder

当你要处理**多轮对话**时，`ChatPromptTemplate` 提供了更精细的控制：

```js
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'

const prompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个友好的中文助手'],
  new MessagesPlaceholder('history'),  // ← 历史对话插入点
  ['human', '{question}'],
])
```

代码位置：`examples/prompt-template-test/src/messages-placeholder.mjs`

这为后面的 Agent 记忆系统埋下了伏笔：`MessagesPlaceholder` 让你能在 prompt 里预留一个"历史消息槽位"，后续由代码动态填充，而不是把历史消息硬编码进 prompt。

---

## 二、Output Parser：让 LLM 输出可编程的数据

### 问题：LLM 输出格式不稳定

即使你在 prompt 里写了"请返回 JSON"，模型也可能这样回复：

```
好的，以下是 JSON 结果：
```json
{"name": "张三", "score": 85}
```
```

你要的是 `{"name": "张三", "score": 85}`，拿到的是带文字说明和 markdown 包层的字符串。每次都手动 `JSON.parse(response.slice(...))` 既不优雅也不可靠。

### JsonOutputParser：自动解析 + 容错

```js
import { JsonOutputParser } from '@langchain/core/output_parsers'

const parser = new JsonOutputParser()
const chain = prompt.pipe(model).pipe(parser)

const result = await chain.invoke({ question: '...' })
// result 是真正的 JS 对象，不是字符串
```

代码位置：`examples/output-parser-test/src/json-output-parser.mjs`

`JsonOutputParser` 做了两件事：
1. 在 prompt 里注入 `getFormatInstructions()`，告诉模型输出 JSON
2. 对输出做 post-process：去掉 markdown 代码块标记，处理常见脏格式，再 `JSON.parse`

### StructuredOutputParser：用 Zod Schema 约束输出结构

`JsonOutputParser` 只管"输出是 JSON"，不管"JSON 的字段对不对"。当你需要更严格的约束时，用 `StructuredOutputParser`：

```js
import { z } from 'zod'
import { StructuredOutputParser } from '@langchain/core/output_parsers'

const schema = z.object({
  name: z.string().describe('姓名'),
  score: z.number().describe('分数'),
  level: z.enum(['优秀', '良好', '及格', '不及格']).describe('等级'),
})

const parser = StructuredOutputParser.fromZodSchema(schema)
```

代码位置：`examples/output-parser-test/src/structured-output-parser.mjs`

### 关键认知纠正

我一开始有个误区，以为 `StructuredOutputParser` 是"模型原生的结构化能力"。其实不是。

`JsonOutputParser` 和 `StructuredOutputParser` 本质上都是 **LangChain 的解析层封装**：在 prompt 里告诉模型按什么格式输出，再由 parser 去解析结果。

而真正利用模型原生协议保证输出格式的，是 `withStructuredOutput`：

```js
const structuredModel = model.withStructuredOutput(schema)
```

`withStructuredOutput` 利用了模型 API 层面的 `response_format` 参数（部分模型支持），输出一致性更好。但它也有缺点：流式场景下，会等到整个结构化输出组装完成才返回，延迟较高。

**实践建议**：
- 非流式 + 需要严格结构 → `withStructuredOutput`
- 流式 + 需要实时反馈 → `JsonOutputParser` + 流式处理

---

## 三、Tool Calling：让 LLM 从"会说"到"会做"

### 核心问题：LLM 能说但做不了

你让 LLM "帮我读一下 `/home/user/config.json` 这个文件"，它会告诉你文件路径看起来像是一个配置文件。但它实际上不会去读文件。

大模型的本质是文本生成器——它没有文件系统访问权限，没有网络请求能力，没有数据库连接。

**Tool / Function Calling 解决的就是这个问题**：给 LLM 装上"手"。

### 最简单的 Tool：read_file

```js
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import fs from 'fs'

const readFileTool = tool(
  async ({ filePath }) => {
    return fs.readFileSync(filePath, 'utf-8')
  },
  {
    name: 'read_file',
    description: '读取本地文件内容。传入文件路径，返回文件文本内容。',
    schema: z.object({
      filePath: z.string().describe('要读取的文件的完整路径'),
    }),
  }
)
```

代码位置：`examples/tool-test/src/tool-file-read.mjs`

关键点：
- `tool()` 的第二个参数里，`name`、`description`、`schema` 都会被序列化发送给 LLM
- **LLM 不是看你函数代码，而是看 schema 来理解工具的用法**
- `schema` 用 Zod 定义，既约束了入参格式，又充当了 LLM 的"使用说明书"

### 绑定工具到模型

```js
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
})

const modelWithTools = model.bindTools([readFileTool])
```

`bindTools` 之后，模型在回复时有了两个选择：
1. 直接生成文本回答
2. 发起一次工具调用，返回一个 `tool_call`

### Agent Loop：工具调用的核心循环

模型不会自动执行工具。你需要自己写一个循环：

```js
const messages = [
  new SystemMessage('你是一个文件分析助手'),
  new HumanMessage('帮我读一下 README.md 的内容并总结'),
]

while (true) {
  const response = await modelWithTools.invoke(messages)
  messages.push(response)

  // 如果模型决定直接回答（没有 tool_calls），就结束
  if (!response.tool_calls?.length) {
    return response.content
  }

  // 否则，逐个执行工具调用
  for (const toolCall of response.tool_calls) {
    if (toolCall.name === 'read_file') {
      const result = await readFileTool.invoke(toolCall.args)
      messages.push(new ToolMessage({
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: result,
      }))
    }
  }
  // 循环回到顶部，让模型基于工具结果继续思考
}
```

这 `while(true)` + `tool_calls` 判断的模式，就是 **Agent Loop**。它是所有 AI Agent 的核心驱动引擎。

### 多工具协作

当一个模型绑定了多个工具，它可以在一次回复里并行调用多个，也可以分多轮逐步调用。来看一个结合了 `read_file`、`web_search` 和 `send_mail` 的真实场景：

```
用户："查一下 README.md 里提到的技术栈，去网上搜一下最新版本，然后发邮件给团队"
→ 模型调用 read_file → 拿到"React 18, Node.js 20, TypeScript 5"
→ 模型调用 web_search → 拿到最新版本信息
→ 模型整理分析后调用 send_mail → 发送邮件
```

代码位置：`examples/tool-test/src/tool-multi-collaboration.mjs`

多工具协作的关键：
- 每个工具的 schema 必须足够清晰，让 LLM 能判断什么时候该用哪个
- 多个工具可以并行调用（同一轮返回多个 `tool_call`）
- 顺序依赖的工具会分多轮执行（先查文件，再搜版本，最后发邮件）

---

## 四、小结

从 Prompt 模板化到 Tool 调用，我们走完了 AI Agent 开发的第一阶段：

```
原始字符串 prompt
    ↓ PromptTemplate（变量分离）
可复用 prompt 模板
    ↓ PipelinePromptTemplate（模块拆分组合）
组件化管理
    ↓ ChatPromptTemplate + MessagesPlaceholder（多轮对话）
多轮对话支持
    ↓ JsonOutputParser / StructuredOutputParser（结构化输出）
输出可控
    ↓ Tool / Function Calling（外部能力扩展）
能真正做事的 Agent
```

这三个能力——**Prompt 管理、Output Parser、Tool Calling**——是构建任何 AI Agent 的基底。下一篇文章，我们给 Agent 装上"记忆"：让它能记住对话历史，根据上下文做出更智能的决策。

---

## 相关代码文件

| 文件 | 说明 |
|------|------|
| `examples/prompt-template-test/` | Prompt 组件化管理全套示例 |
| `examples/output-parser-test/` | Output Parser + withStructuredOutput |
| `examples/tool-test/src/tool-file-read.mjs` | 单工具：文件读取 |
| `examples/tool-test/src/tool-multi-collaboration.mjs` | 多工具协作 |
