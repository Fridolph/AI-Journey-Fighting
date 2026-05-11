// Step 6：全家桶 — 分支 + 并行 + 记忆
// 目标： 把 step4 的分支 + step5 的并行 + runWithMemory 全部整合。再加一个英文摘要链。
// 架构：
// 用户输入
//   → 意图分类（RunnableBranch，短文本固定回复）
//   → 默认走 RunnableMap 并行：
//        ├─ advice:     careerChain          （完整回答）
//        ├─ sentiment:  sentimentChain       （积极/中性/消极）
//        └─ enSummary:  enSummaryChain       （一句话英文总结）
//   → 外套 runWithMemory

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

// 2 三个 Prompt 子模块
const personaPrompt = PromptTemplate.fromTemplate(
  '你叫{name}，是一位资深的职业规划导师 与 资深编程专家，擅长帮助技术人员规划学习、技术转型、提升等。'
);
const formatPrompt = PromptTemplate.fromTemplate(
  '回答要求：\n1. 给出清晰的学习路线\n2. 列出关键里程碑\n3. 推荐学习资源\n4. 使用 Markdown 格式\n5. 提问者是修仙小说爱好者，而你也擅长借修仙隐喻现实，寓教于乐\n6. 回答简洁、概括，犀利现实又为人着想\n'
);
const taskPrompt = PromptTemplate.fromTemplate(
  '用户向你提出了以下问题：{question}'
);

// 3 ChatPromptTemplate（含历史插入点）
const finalChatPrompt = ChatPromptTemplate.fromMessages([
  ['system', '{persona_block}'],
  ['system', '{format_block}'],
  new MessagesPlaceholder('history'),    // 历史注入点
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

// 单独写个情绪分析链
const sentimentPrompt = PromptTemplate.fromTemplate('判断以下文本的情绪，只回"积极""中性""消极"中的一个词：\n{question}')
const summaryPrompt = PromptTemplate.fromTemplate('将以下回答总结为两句话以内的中文句子：\n{answer}"')

const sentimentChain = RunnableSequence.from([
  sentimentPrompt,

  model,
  new StringOutputParser(),
])

// 并行：careerChain 和 sentimentChain 同时执行
const res = RunnableMap.from({
  advice: careerChain,
  sentiment: sentimentChain,
})

const result = await res.invoke({
  name: '道无',                          // ← personaPrompt 需要
  question: '修仙真的好难啊，我怎么才能借由AI踏入元婴之境？',
  history: [],
})

console.log(chalk.blue('问题：修仙真的好难啊，我怎么才能借由AI踏入元婴之境？\n\n'))
console.log(result)