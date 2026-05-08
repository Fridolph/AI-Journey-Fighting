// 练习 ⑦：RunnableWithMessageHistory — 带记忆的对话
// 题目： 构建一个带记忆的聊天助手，能记住用户之前说过的话。
// 第一轮：告诉 AI "我叫张三，喜欢打篮球"
// 第二轮：问 AI  "我叫什么名字？"
// 第三轮：问 AI  "我喜欢什么？"
// 期望 AI 能答出"张三"和"打篮球"
// API 提示：
// - import { RunnableWithMessageHistory } from '@langchain/core/runnables'
// - import { InMemoryChatMessageHistory } from '@langchain/core/chat_history'
// - import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
// - import { ChatOpenAI } from '@langchain/openai'
// - import { StringOutputParser } from '@langchain/core/output_parsers'
// 伪代码：
// model = new ChatOpenAI({...})
// prompt = ChatPromptTemplate.fromMessages([
//   ['system', '你是一个友好的中文助手'],
//   new MessagesPlaceholder('history'),      // 历史对话插入点
//   ['human', '{question}'],
// ])
// simpleChain = prompt.pipe(model).pipe(new StringOutputParser())
// // 管理每个 sessionId 的历史
// histories = new Map()
// chain = new RunnableWithMessageHistory({
//   runnable: simpleChain,
//   getMessageHistory: (sessionId) => ...,
//   inputMessagesKey: 'question',
//   historyMessagesKey: 'history',
// })
// // 第一轮
// chain.invoke({ question: '我叫张三，喜欢打篮球' }, { configurable: { sessionId: 'user-1' } })
// // 第二轮（同一 sessionId，AI 会记住）
// chain.invoke({ question: '我叫什么名字？' }, { configurable: { sessionId: 'user-1' } })
// 参考 RunnableWithMessageHistory.mjs 原文件，自己写一版跑起来。这是这一章最重要的练习，后面的 Agent 都靠这个做记忆。

import 'dotenv/config';
import { RunnableWithMessageHistory } from '@langchain/core/runnables'
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history'
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'
import { StringOutputParser } from '@langchain/core/output_parsers'

const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.3,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const prompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个友好的中文助手'],
  new MessagesPlaceholder('messageHistories'),      // 历史对话插入点
  ['human', '{question}'],
])

const simpleChain = prompt.pipe(model).pipe(new StringOutputParser())

// 管理每个 sessionId 的历史
const messageHistories = new Map();

const getMessageHistory = (sessionId) => {
  if (!messageHistories.has(sessionId)) {
    messageHistories.set(sessionId, new InMemoryChatMessageHistory());
  }
  return messageHistories.get(sessionId);
};


const chain = new RunnableWithMessageHistory({
  runnable: simpleChain,
  getMessageHistory,
  inputMessagesKey: 'question',
  historyMessagesKey: 'messageHistories',
})

// // 第一轮
console.log('🚀 ~ 第一轮回答: \n')
const r1 = await chain.invoke({ question: '我叫张三，喜欢打篮球' }, { configurable: { sessionId: 'user-1' } })
console.log(r1)

console.log('---------  第一轮回答结束 --------')

console.log('\n\n\n🚀   第二轮回答：\n')
// // 第二轮（同一 sessionId，AI 会记住）
const r2 = await chain.invoke({ question: '我叫什么名字？' }, { configurable: { sessionId: 'user-1' } })
console.log(r2)
// 参考 RunnableWithMessageHistory.mjs 原文件，自己写一版跑起来。这是这一章最重要的练习，后面的 Agent 都靠这个做记忆。