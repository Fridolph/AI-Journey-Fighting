// Step 1：最简单的链 — Prompt + LLM + 文本输出
// 目标： 搭一条链：PromptTemplate → ChatOpenAI → StringOutputParser，输入一个问题，拿到回答。
// 你需要在 src/practice/step1.mjs 文件里写出以下伪代码的实现：
// ① 导入
import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { RunnableSequence } from '@langchain/core/runnables';   // ← 从 runnables 导入
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

// ② 初始化模型（之前写过很多次了）
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.3,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// ③ 创建 PromptTemplate：模板是 "请用简洁的语言回答：{question}"
const questionTemp = PromptTemplate.fromTemplate('请用简洁的语言回答：{question}')

// ④ 组装 chain：promptTemplate.pipe(model).pipe(new StringOutputParser())
// const chain = questionTemp
//     .pipe(model)
//     .pipe(new StringOutputParser())
//    或者 RunnableSequence.from([...])
// ⑤ invoke，打印结果
//    输入 { question: '什么是 RunLoop？' }

// 方式二：RunnableSequence（等价）
const chain = RunnableSequence.from([
  questionTemp,
  model,
  new StringOutputParser(),
]);

const result = await chain.invoke({
    question: '什么是 RunLoop ? '
})
console.log('🚀 result:\n', result)
