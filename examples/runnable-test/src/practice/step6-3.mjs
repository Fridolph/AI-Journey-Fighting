// Step 6-3：把 careerChain 加进 Map
// 现在 Map 里有 mood 和 summary，再加一个 advice：
// ① 复用 step5 的 personaPrompt / formatPrompt / taskPrompt（复制过来）
// ② 复用 step5 的 pipeline + careerChain（复制过来）
// ③ 三个链装进 Map
// const map = RunnableMap.from({
//   advice: careerChain,
//   mood: moodChain,
//   summary: summaryChain,
// })
// ④ invoke — 注意：careerChain 的 pipeline 需要 { name, question, history }
// const result = await map.invoke({
//   name: '道无',
//   question: '今天学了 RunnableMap，感觉入门了，接下来该学什么？',
//   history: [],
// })
// 跑通贴 { advice, mood, summary } 结果，进 6-4。
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

// ② 复用 step5 的 pipeline + careerChain（复制过来）
const personaPrompt = PromptTemplate.fromTemplate(
  '你叫{name}，是一位资深的职业规划导师 与 资深编程专家，擅长帮助技术人员规划学习、技术转型、提升等。'
);
const formatPrompt = PromptTemplate.fromTemplate(
  '回答要求：\n1. 给出清晰的学习路线\n2. 列出关键里程碑\n3. 推荐学习资源\n4. 使用 Markdown 格式\n5. 提问者是修仙小说爱好者，而你也擅长借修仙隐喻现实，寓教于乐\n6. 回答简洁、概括，犀利现实又为人着想\n'
);
const taskPrompt = PromptTemplate.fromTemplate(
  '用户向你提出了以下问题：{question}'
);
const moodPrompt = PromptTemplate.fromTemplate('判断情绪，只回积极/消极/中性：\n{question}')
const moodChain = RunnableSequence.from([moodPrompt, model, new StringOutputParser()])
const summaryPrompt = PromptTemplate.fromTemplate('将以下内容总结为一句话中文：\n{question}')
const summaryChain = RunnableSequence.from([summaryPrompt, model, new StringOutputParser()])

const finalChatPrompt = ChatPromptTemplate.fromMessages([
  ['system', '{persona_block}'],
  ['system', '{format_block}'],
  new MessagesPlaceholder('history'),
  ['human', '{task_block}'],
]);

const pipeline = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: 'persona_block', prompt: personaPrompt },
    { name: 'format_block',  prompt: formatPrompt },
    { name: 'task_block',    prompt: taskPrompt },
  ],
  finalPrompt: finalChatPrompt,
});
const careerChain = RunnableSequence.from([
  pipeline,
  model,
  new StringOutputParser(),
]);

// ③ 三个链装进 Map
const map = RunnableMap.from({
    advice: careerChain,
    mood: moodChain,
    summary: summaryChain,
})

// ④ invoke — 注意：careerChain 的 pipeline 需要 { name, question, history }
const result = await map.invoke({
  name: '道无',
  question: '今天学了 RunnableMap，感觉入门了，接下来该学什么？',
  history: [],
})
console.log('🚀 ~ :82 ~ result:', result)
