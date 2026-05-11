# 学习 AI ，建立AI开发的心智模型

## Vue 心智模型

- template 声明UI结构 模版
- script 声明 数据 + 逻辑 (ref computed watch hooks 等)
- style 样式声明

渲染：UI = fn(State)
套路：template 搭骨架 -> script 填逻辑 -> style 样式美化

---

## AI 开发心智模型

- Prompt 声明AI的任务和约束
- Model 调用大模型 引擎
- Output 解析输出 

调用：Answer = Chain(Input)
套路：Prompt 定义任务 -> Model 执行 -> Parser 取结果

---

## 开发固定套路（先熟读唐诗三百首）

### 1、写死跑通 - 最简链路

PromptTemplte -> ChatOpenAI -> StringOutputParser

chain.invoke({ question: 'xxx' })  目的：确认模型能连通，输出拿到结果

### 2、把 prompt 模版化（若复杂）

- personal 拆人设
- task 拆任务 类比 前端页面拆模块
- format 格式化  这一步是为了复用

PipelinePromptTemplat，拆成可复用零件，利于维护、组合、复用

### 3、加上控制流 （LCEL非必须）

- 顺序 RunnableSequence
- 并行 RunnableMap
- 分支 RunnableBranch
- 循环 RunnableEach

### 4、加上记忆（持久化更好用）

MessagePlaceholder + 手动 Messages[] 数组管理

压缩摘要等技术手段

### 5、美化 + 增强

- withRetry
- withFallbacks
- Chalk 美化命令行输出

## 万能起手公式

```js
import 'dotenv/config'
import { ChatOpenAI } from '@langchain/openai'
import { PromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_prasers'

// 1. model 固定模版
const model = new ChatOpenAI({

})

// 2. 提示词（每次都会改这里）
const prompt = PromptTemplate.fromTemplate('你对 AI 说的话: {question}')

// 3. 链  基本为固定模版
const chain = prompt.pipe(model).pipe(new StringOutputParser())

// 4. 调用
const result = await chain.invoke({ question: '...' }) // 这里的 question 就是传给上面提示词的

console.log(result) 

// 5. 流式调用
// const stream = await chain.stream({
//     question: '...',
// })

// // 回答
// for await (const chunk of stream) {
//     process.stdout.write(chunk);
// }
// console.log('\nAI 回答完毕\n');
```
