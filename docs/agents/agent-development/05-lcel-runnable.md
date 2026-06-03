# LCEL 声明式链式组装：把逻辑变成拼图

## 开篇

前面几篇文章里，我们写的代码都是**命令式**的——每一步手动调用、存中间变量、再传给下一步：

```js
// 命令式：每步都写一行 await
const prompt = await template.format(input)
const reply = await model.invoke(prompt)
const result = await parser.parse(reply.content)
```

这能跑，但当步骤变多（查询用户 → 加载简历 → 向量检索 → 噪声过滤 → 证据分层 → Prompt 构建 → LLM 调用 → Output Parser → 格式转换），代码就变成了"意大利面"。

**LangChain 的 LCEL（LangChain Expression Language）提供了一种声明式的方式**：不用写执行逻辑，而是像搭积木一样把组件拼起来。数据自动流过每个组件，你只需要关心"输入什么"和"输出什么"。

> 代码来自 `examples/runnable-test/`。

---

## 一、核心概念：从命令式到声明式

```
命令式（Imperative）          声明式 LCEL（Declarative）
─────────────────────         ─────────────────────────
const a = step1(input)        const chain = step1
const b = step2(a)               .pipe(step2)
const c = step3(b)               .pipe(step3)
                               const c = await chain.invoke(input)
```

**核心原则**：LangChain 的 PromptTemplate、ChatOpenAI、OutputParser 都实现了 `Runnable` 接口。`.pipe()` 能把任意两个 Runnable 串起来，`.invoke()` 让数据从左到右自动流过。

### 第一个例子：Prompt → Model → Parser

```js
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'
import { StringOutputParser } from '@langchain/core/output_parsers'

const prompt = ChatPromptTemplate.fromTemplate('用一句话介绍 {topic}')
const model = new ChatOpenAI({ /* ... */ })
const parser = new StringOutputParser()

// LCEL 一行组装
const chain = prompt.pipe(model).pipe(parser)

const result = await chain.invoke({ topic: 'LangChain' })
// → "LangChain 是一个用于构建 LLM 应用的开源框架..."
```

代码位置：`examples/runnable-test/src/runnable.mjs`

对比命令式写法：

```js
// 每步都要存中间变量，步骤越多越乱
const formatted = await prompt.format({ topic: 'LangChain' })
const aiMessage = await model.invoke(formatted)
const result = parser.parse(aiMessage.content)
```

---

## 二、RunnableLambda：普通函数也能加入 chain

你不需要把每个函数都写成 class。`RunnableLambda` 能把任何普通函数变成 Runnable：

```js
import { RunnableLambda } from '@langchain/core/runnables'

const add5 = RunnableLambda.from(x => x + 5)
const mul3 = RunnableLambda.from(x => x * 3)
const sub2 = RunnableLambda.from(x => x - 2)

import { RunnableSequence } from '@langchain/core/runnables'
const chain = RunnableSequence.from([add5, mul3, sub2])

await chain.invoke(10)  // 10 → 15 → 45 → 43
```

代码位置：`examples/runnable-test/src/fri/1.mjs`

---

## 三、RunnableMap：并行处理

当你需要同时做多件互不依赖的事时，用 `RunnableMap`：

```js
import { RunnableMap } from '@langchain/core/runnables'

const input = { name: '张三', salary: 15000, department: '技术部' }

const result = await RunnableMap.from({
  newSalary:    (input) => input.salary * 1.2,
  greeting:     PromptTemplate.fromTemplate('你好，{name}！欢迎加入{department}'),
  annualSalary: (input) => input.salary * 12,
}).invoke(input)

// → { newSalary: 18000, greeting: '你好，张三！欢迎加入技术部', annualSalary: 180000 }
```

代码位置：`examples/runnable-test/src/fri/2.mjs`

**传参机制**：Map 里的每个 Runnable 都接收**整个 input 对象**，各自取自己需要的字段。

### Sequence + Map 混用：先处理，再并行

```js
const clean = (text) => text.trim().replace(/\s+/g, ' ')

const parallel = RunnableMap.from({
  upper:     (text) => text.toUpperCase(),
  lower:     (text) => text.toLowerCase(),
  wordCount: (text) => text.split(' ').length,
})

const addTimestamp = (obj) => ({ ...obj, timestamp: Date.now() })

const chain = RunnableSequence.from([clean, parallel, addTimestamp])

await chain.invoke('  Hello   World   from   LangChain  ')
// → { upper: 'HELLO WORLD FROM LANGCHAIN', lower: 'hello world from langchain',
//     wordCount: 4, timestamp: 1717xxxxxxxx }
```

代码位置：`examples/runnable-test/src/fri/3.mjs`

数据流：文本 → 清洗 → 并行处理四件事 → 合并 → 加时间戳。

---

## 四、RunnableBranch：条件分支

Chain 里的 if-else 逻辑：

```js
import { RunnableBranch } from '@langchain/core/runnables'

const levelChain = RunnableBranch.from([
  [(input) => input.score >= 90, (input) => ({ ...input, level: '优秀' })],
  [(input) => input.score >= 80, (input) => ({ ...input, level: '良好' })],
  [(input) => input.score >= 60, (input) => ({ ...input, level: '及格' })],
                                 (input) => ({ ...input, level: '不及格' }),  // 默认
])

await levelChain.invoke({ score: 85 })
// → { score: 85, level: '良好' }
```

代码位置：`examples/runnable-test/src/fri/4.mjs`

**注意匹配顺序**——第一个条件为 true 就执行，后面的条件不再判断。

---

## 五、RouterRunnable：路由分发

比 Branch 更适合"按 key 路由到不同处理器"的场景：

```js
import { RouterRunnable } from '@langchain/core/runnables'

const router = new RouterRunnable({
  runnables: {
    email: RunnableLambda.from((input) =>
      `发送邮件给 ${input.to}，内容：${input.content}`),
    sms:   RunnableLambda.from((input) =>
      `发送短信给 ${input.phone}，内容：${input.content}`),
    push:  RunnableLambda.from((input) =>
      `推送通知给 ${input.userId}，内容：${input.content}`),
  },
})

await router.invoke({ key: 'email', input: { to: 'fys@qq.com', content: 'hello' } })
// → "发送邮件给 fys@qq.com，内容：hello"
```

代码位置：`examples/runnable-test/src/fri/5.mjs`

---

## 六、RunnablePassthrough：保留原始数据

类似 `Object.assign`——在原始数据上扩展新字段，原数据不丢失：

```js
import { RunnablePassthrough } from '@langchain/core/runnables'

const chain = RunnablePassthrough.assign({
  displayName: (input) => `${input.name}（${input.age}岁）`,
  isAdult:     (input) => input.age >= 18,
})

await chain.invoke({ name: '李四', age: 28, city: '上海' })
// → { name: '李四', age: 28, city: '上海', displayName: '李四（28岁）', isAdult: true }
```

代码位置：`examples/runnable-test/src/fri/6.mjs`

这在 RAG 流程中非常有用——检索结果要和原始问题一起流向下一阶段。

---

## 七、RunnableWithMessageHistory：自带记忆的 Chain

把 Memory 能力注入到任意 chain 上：

```js
import { RunnableWithMessageHistory } from '@langchain/core/runnables'
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history'

const histories = new Map()

const chainWithMemory = new RunnableWithMessageHistory({
  runnable: prompt.pipe(model).pipe(parser),
  getMessageHistory: (sessionId) => {
    if (!histories.has(sessionId)) {
      histories.set(sessionId, new InMemoryChatMessageHistory())
    }
    return histories.get(sessionId)
  },
  inputMessagesKey: 'question',       // 输入中的哪个字段是用户消息
  historyMessagesKey: 'history',      // 历史消息插入到 prompt 的哪个占位
})

// 第一轮 — sessionId 为 'user-1'
await chainWithMemory.invoke(
  { question: '我叫张三，喜欢打篮球' },
  { configurable: { sessionId: 'user-1' } }
)

// 第二轮 — 同一 sessionId，AI 记得上一轮的内容
await chainWithMemory.invoke(
  { question: '我叫什么名字？' },
  { configurable: { sessionId: 'user-1' } }
)
// → "你叫张三"
```

代码位置：`examples/runnable-test/src/fri/7.mjs`

---

## 八、高级增强：重试、降级、回调、配置注入

### withRetry：自动重试

```js
const reliableChain = chain.withRetry({
  stopAfterAttempt: 3,      // 最多重试 3 次
  onFailedAttempt: (error, attempt) => {
    console.log(`第 ${attempt} 次失败: ${error.message}`)
  },
})
```

### withFallbacks：降级备选

```js
const resilientChain = primaryModel
  .pipe(prompt)
  .withFallbacks({
    fallbacks: [backupModel.pipe(prompt)],  // 主模型挂了用备选
  })
```

### withCallbacks：全链路监控

```js
const instrumentedChain = chain.withConfig({
  callbacks: [{
    handleLLMStart: async (llm, prompts) => { /* LLM 调用开始时触发 */ },
    handleLLMEnd: async (output) => { /* LLM 调用结束时触发 */ },
    handleChainError: async (err) => { /* 任何环节出错时触发 */ },
  }],
})
```

代码位置：`examples/runnable-test/src/fri/`

---

## 九、实战：用 LCEL 重写 RAG 流程

之前我们写的 RAG 是命令式的。用 LCEL 重写后：

```js
// 命令式 RAG
const queryVec = await embeddings.embedQuery(question)
const docs = await milvus.search({ vector: queryVec, limit: 3 })
const context = docs.map(d => d.content).join('\n')
const prompt = await ragPrompt.format({ context, question })
const answer = await model.invoke(prompt)

// LCEL RAG
const retriever = RunnableLambda.from(async (q) => {
  const vec = await embeddings.embedQuery(q)
  const docs = await milvus.search({ vector: vec, limit: 3 })
  return { context: docs.map(d => d.content).join('\n'), question: q }
})

const ragChain = retriever
  .pipe(ragPrompt)
  .pipe(model)
  .pipe(new StringOutputParser())

const answer = await ragChain.invoke('乔峰为什么改名萧峰？')
```

代码位置：`examples/runnable-test/src/lcel-rag.mjs`

---

## 十、LCEL 组件速查

| 组件 | 用途 | 类比 |
|------|------|------|
| `pipe()` / `RunnableSequence` | 顺序串联 | 管道 |
| `RunnableMap` | 并行执行 | Promise.all |
| `RunnableBranch` | 条件分支 | if-else |
| `RouterRunnable` | 路由分发 | switch-case |
| `RunnablePassthrough` | 保留并扩展 | Object.assign |
| `RunnableLambda` | 普通函数接入 | 适配器 |
| `withRetry` | 失败重试 | 可靠性 |
| `withFallbacks` | 降级备用 | 容错 |
| `withMessageHistory` | 对话记忆 | 状态管理 |
| `withCallbacks` | 全链路回调 | 生命周期钩子 |

---

## 十一、小结

LCEL 的核心价值：

1. **声明式 > 命令式**：不用写执行顺序，搭积木就行
2. **可组合**：每个 Runnable 是独立模块，`.pipe()` 任意组合
3. **可观测**：`withCallbacks` 在链上任一点插入监控
4. **可扩展**：`RunnableLambda` 让任何函数都能加入 chain

当你从"写逻辑"切换到"组装 chain"的心智模型时，复杂的 Agent 流程就变成了积木游戏。这对接下来的 NestJS 集成至关重要——在那里我们会看到，每个 Tool 也是一个 Runnable，通过依赖注入组装成一个完整的 Agent 服务。

---

## 相关代码文件

| 文件 | 说明 |
|------|------|
| `examples/runnable-test/src/before.mjs` | 命令式写法（对比基准） |
| `examples/runnable-test/src/runnable.mjs` | LCEL 声明式写法 |
| `examples/runnable-test/src/fri/1.mjs` | Sequence + Lambda 串联 |
| `examples/runnable-test/src/fri/2.mjs` | RunnableMap 并行 |
| `examples/runnable-test/src/fri/3.mjs` | Sequence + Map 混用 |
| `examples/runnable-test/src/fri/4.mjs` | Branch 条件分支 |
| `examples/runnable-test/src/fri/5.mjs` | RouterRunnable 路由 |
| `examples/runnable-test/src/fri/6.mjs` | RunnablePassthrough |
| `examples/runnable-test/src/fri/7.mjs` | WithMessageHistory 记忆 |
| `examples/runnable-test/src/lcel-rag.mjs` | LCEL 重写 RAG |
| `examples/runnable-test/src/lcel-mcp.mjs` | LCEL 重写 MCP 多工具 |
