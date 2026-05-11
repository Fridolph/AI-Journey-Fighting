import 'dotenv/config';
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate, MessagesPlaceholder, PipelinePromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { RunnableBranch, RunnableLambda, RunnableMap, RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import chalk from 'chalk';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

// 1 固定套路model
const modelWithRetry = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.3,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
}).withRetry({
    stopAfterAttempt: 3
})

// Step 8：全家桶 — 分支 + 并行 + 记忆 + 兜底
// 这是这一章的终极形态。 在 step7 基础上加回 branch 和 runWithMemory。
// 架构：
// 用户输入
//   → 意图分类（短文本固定回复 / 默认走并行）
//   → RunnableMap:
//        ├─ advice:     careerChain    (withRetry + withFallbacks)
//        ├─ mood:       moodChain
//        └─ summary:    summaryChain
//   → 外套 runWithMemory


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
const summaryPrompt = PromptTemplate.fromTemplate('将以下内容总结为一句话中文：\n{question}')

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
  modelWithRetry,
  new StringOutputParser(),
]).withFallbacks({
    fallbacks: [
        RunnableLambda.from(() => '抱歉，AI 服务暂时不可用，请稍后再试。')
    ]
})
const moodChain = RunnableSequence.from([moodPrompt, modelWithRetry, new StringOutputParser()])
const summaryChain = RunnableSequence.from([summaryPrompt, modelWithRetry, new StringOutputParser()])

// ─── 并行 Map ───
const map = RunnableMap.from({ 
    advice: careerChain, 
    mood: moodChain, 
    summary: summaryChain 
})

// ─── 分支（参考 step4-update）───
const isShort = (q) => q.trim().length <= 8;
const branch = RunnableBranch.from([
  [(input) => isShort(input.question) && /你好|hello|嗨/i.test(input.question),
    RunnableLambda.from(() => '你好！我是道无，你的职业规划导师。有什么可以帮你？')],
  [(input) => isShort(input.question) && /谢谢|感谢/i.test(input.question),
    RunnableLambda.from(() => '不客气！有任何问题随时找我。')],
  map,  // ← 默认走并行
]);

// ─── 记忆（复制 step4-update 的 runWithMemory）───
const sessions = new Map();
async function runWithMemory(chain, sessionId, input) {
  // 获取或创建会话
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { name: input.name, messages: [] });
  }

  const session = sessions.get(sessionId);

  // step1: invoke 前，把历史塞进 input
  const inputWithHistory = {
    ...input,
    history: session.messages,          // ← 这个 key 必须和 MessagesPlaceholder('history') 一致
  };

  // step2: 执行 chain
  const answer = await chain.invoke(inputWithHistory);

  // step3: 把本轮 human + AI 回答写回历史
  session.messages.push(new HumanMessage(input.question));
  session.messages.push(new AIMessage(answer));

  return answer;
}

async function main() {
  const sid = 'user-1';
  const userName = '韩立';
  const botName = '道无';

  console.log(chalk.cyan.bold(`👤 ${userName} (第1轮):\n`));
  const r1 = await runWithMemory(branch, sid, { name: botName, question: '你好' });
  console.log(chalk.green.bold(`🤖 ${botName}:\n`));
  console.log(r1);
  console.log(chalk.gray('─'.repeat(60)));

  // 第2轮
  console.log(chalk.cyan.bold(`\n👤 ${userName} (第2轮):\n`));
  const q2 = '我叫韩立，刚迈出金丹，修炼前端技术至今有十年，但现卡金丹期久矣';
  const stream2 = await careerChain.stream({
    ...sessions.get(sid).messages.length ? { history: sessions.get(sid).messages } : { history: [] },
    name: botName,
    question: q2,
  });
  console.log(chalk.green.bold(`🤖 ${botName}:\n`));
  let r2answer = '';
  for await (const chunk of stream2) {
    process.stdout.write(chunk);
    r2answer += chunk;
  }
  sessions.get(sid).messages.push(new HumanMessage(q2));
  sessions.get(sid).messages.push(new AIMessage(r2answer));
  console.log(chalk.gray('\n' + '─'.repeat(60)));

  // 第3轮
  console.log(chalk.cyan.bold(`\n👤 ${userName} (第3轮):\n`));
  const r3 = await runWithMemory(branch, sid, { name: botName, question: '今AI大行其道，唯有顺势而为，学AI Agent，转全栈方能走得更远，想问老君，我如何凝练元婴突破金丹巅峰？' });
  console.log(chalk.green.bold(`🤖 ${botName}:\n`));
  console.log(r3);
  console.log(chalk.gray('─'.repeat(60)));

  // 第4轮：混合语气验证 — 问题里夹带谢谢，应走 LLM
  console.log(chalk.cyan.bold(`\n👤 ${userName} (第4轮 - 混合语句):\n`));
  const q4 = '当前我该如何利用自身优势，进行补足和提高呢？';
  const r4 = await runWithMemory(branch, sid, { name: botName, question: q4 });
  console.log(chalk.green.bold(`🤖 ${botName}:\n`));
  console.log(r4);

  // 第5轮：纯致谢（应走固定回复）
  console.log(chalk.cyan.bold(`\n👤 ${userName} (第5轮):\n`));
  const r5 = await runWithMemory(branch, sid, { name: botName, question: '谢谢' });
  console.log(chalk.green.bold(`🤖 ${botName}:\n`));
  console.log(r5);
  console.log(chalk.gray('─'.repeat(60)));

  // 第6轮（新增）：混合语气验证 — 问题里夹带谢谢，应走 LLM
  console.log(chalk.cyan.bold(`\n👤 ${userName} (第6轮 - 混合语句):\n`));
  const q6 = '结合我的情况，为我进行下全方面的概要总结呢';
  const r6 = await runWithMemory(branch, sid, { name: botName, question: q6 });
  console.log(chalk.green.bold(`🤖 ${botName}:\n`));
  console.log(r6);
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.gray('─'.repeat(60)));

  // 验证记忆
  console.log(chalk.yellow.bold(`\n📋 ${userName} 的会话历史条数:`), sessions.get(sid).messages.length);
}

main();