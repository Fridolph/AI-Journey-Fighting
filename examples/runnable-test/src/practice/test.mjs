import 'dotenv/config';
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";

// 初始化 model - 后面可以统一封装使用
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.3,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// 创建 prompt 模版
const questionTemp = PromptTemplate.fromTemplate('请用简洁的语言回答：{question}')

// 组装chain
const chain = RunnableSequence.from([
    questionTemp,
    model,
    new StringOutputParser(),
])

console.log('Q: 前端工程师如何转型和学习? \n')

// 拿到结果并打印
const stream = await chain.stream({
    question: '前端工程师如何转型和学习 AI 呢？'
})

console.log("\n【AI 流式回答】\n");


for await (const chunk of stream) {
    process.stdout.write(chunk);
}

console.log("\n");