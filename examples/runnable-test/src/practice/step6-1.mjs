// Step 6-1：搭骨架
// 只写情绪链 + 英文摘要链，两个单独跑通，不组合。
// 创建 src/practice/step6.mjs，先写这个：
// ① 导入 + model（固定模板，从 step5 复制）
// ② 情绪链：PromptTemplate → model → StringOutputParser
//    单独 invoke({ question: '我好开心' })  → 期望 '积极'
// ③ 英文摘要链：PromptTemplate → model → StringOutputParser  
//    单独 invoke({ question: '前端工程师如何转型AI' }) → 期望 一句英文
// API 精确提示：
// PromptTemplate 正确写法：
// PromptTemplate.fromTemplate('模板文本：{变量名}')
// StringOutputParser 正确写法：
// new StringOutputParser()    // 注意：有括号，是实例化
// RunnableSequence.from 正确写法（同步，不要 await）：
// RunnableSequence.from([prompt, model, new StringOutputParser()])
// invoke 正确写法（异步，要 await）：
// await chain.invoke({ question: '...' })
// 写出来，跑通两个链的单独 invoke，贴结果给我。

import 'dotenv/config';
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate, MessagesPlaceholder, PipelinePromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { RunnableMap, RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import chalk from 'chalk';

// 1 固定套路model
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.3,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// 回到 Step 6-1 的正确写法——先不组合，两条链各自跑通：
// ✅ 链 1：情绪分析（完整链路，单独 invoke）
const moodPrompt = PromptTemplate.fromTemplate('判断情绪，只回积极/消极/中性：\n{question}')
const moodChain = RunnableSequence.from([moodPrompt, model, new StringOutputParser()])
// ✅ 链 2：英文摘要（完整链路，单独 invoke）
const summaryPrompt = PromptTemplate.fromTemplate('将以下内容总结为一句话中文：\n{question}')
const summaryChain = RunnableSequence.from([summaryPrompt, model, new StringOutputParser()])

const runnableMap = RunnableMap.from({
    mood: moodChain,
    summary: summaryChain,
})

const result = await runnableMap.invoke({
    question: '今天还是在学习AI相关内容，虽然没有推进太多，但是我把内容进行了拆分。现在学到了 RunnableMap 的用法，感觉终于有那么点入门了，小小的欣慰。'
})
console.log('🚀 ~ :57 ~ result:', result)

