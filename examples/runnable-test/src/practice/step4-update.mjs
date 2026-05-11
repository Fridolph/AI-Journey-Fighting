/**
 * Step 4-fix：手动管理对话记忆（不依赖已废弃的 RunnableWithMessageHistory）
 *
 * 替换原理：
 *   RunnableWithMessageHistory 内部就做了两件事：
 *     ① invoke 前：从 session 取历史 → 塞进 MessagesPlaceholder('history')
 *     ② invoke 后：把本轮 human 提问 + AI 回答 → 写回历史
 *
 *   我们用 runWithMemory(chain, sessionId, input) 一个函数搞定。
 */

import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import {
  PipelinePromptTemplate,
  PromptTemplate,
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import {
  RunnableSequence,
  RunnableBranch,
  RunnableLambda,
} from '@langchain/core/runnables';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import chalk from 'chalk';

// ============================================================
// ① 初始化模型
// ============================================================
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// ============================================================
// ② 三个 Prompt 子模块
// ============================================================
const personaPrompt = PromptTemplate.fromTemplate(
  '你叫{name}，是一位资深的职业规划导师 与 资深编程专家，擅长帮助技术人员规划学习、技术转型、提升等。'
);
const formatPrompt = PromptTemplate.fromTemplate(
  '回答要求：\n1. 给出清晰的学习路线\n2. 列出关键里程碑\n3. 推荐学习资源\n4. 使用 Markdown 格式\n5. 提问者是修仙小说爱好者，而你也擅长借修仙隐喻现实，寓教于乐\n6. 回答简洁、概括，犀利现实又为人着想\n'
);
const taskPrompt = PromptTemplate.fromTemplate(
  '用户向你提出了以下问题：{question}'
);

// ============================================================
// ③ ChatPromptTemplate（含历史插入点）
// ============================================================
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

// ============================================================
// ④ 意图分类
// ============================================================
// 意图分类：短文本走固定回复，长文本走 LLM（避免 "一大段问题+谢谢" 被误判）
const isShort = (q) => q.trim().length <= 8;
const branch = RunnableBranch.from([
  [(input) => isShort(input.question) && /你好|hello|嗨|hi|在吗/i.test(input.question),
    RunnableLambda.from(() => '小友好！我是【道无】真君，大道生涯指导规划导师。有什么可以帮你？')],
  [(input) => isShort(input.question) && /谢谢|感谢|thanks|thank/i.test(input.question),
    RunnableLambda.from(() => '不客气！有任何问题随时找本座。')],
  careerChain,
]);

// ============================================================
// ⑤ 手动记忆管理（替代 RunnableWithMessageHistory）
// ============================================================
const sessions = new Map();  // sessionId → { name, messages[] }

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

// ============================================================
// ⑥ 测试
// ============================================================
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
  const q2 = '我叫韩立，刚迈出金丹，修炼前端技术至今有十年，但现卡金丹期久矣；而今AI大行其道，唯有顺势而为，学AI Agent，转全栈方能走得更远，想问老君，我如何凝练元婴突破金丹巅峰？';
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
  const r3 = await runWithMemory(branch, sid, { name: botName, question: '根据我的背景，我该补充哪些 AI 技能？' });
  console.log(chalk.green.bold(`🤖 ${botName}:\n`));
  console.log(r3);
  console.log(chalk.gray('─'.repeat(60)));

  // 第4轮：纯致谢（应走固定回复）
  console.log(chalk.cyan.bold(`\n👤 ${userName} (第4轮):\n`));
  const r4 = await runWithMemory(branch, sid, { name: botName, question: '谢谢' });
  console.log(chalk.green.bold(`🤖 ${botName}:\n`));
  console.log(r4);
  console.log(chalk.gray('─'.repeat(60)));

  // 第5轮（新增）：混合语气验证 — 问题里夹带谢谢，应走 LLM
  console.log(chalk.cyan.bold(`\n👤 ${userName} (第5轮 - 混合语句):\n`));
  const q5 = '帮我总结下前面我的背景，另外谢谢你的建议';
  const r5 = await runWithMemory(branch, sid, { name: botName, question: q5 });
  console.log(chalk.green.bold(`🤖 ${botName}:\n`));
  console.log(r5);
  console.log(chalk.gray('─'.repeat(60)));

  // 验证记忆
  console.log(chalk.yellow.bold(`\n📋 ${userName} 的会话历史条数:`), sessions.get(sid).messages.length);
}

main();
