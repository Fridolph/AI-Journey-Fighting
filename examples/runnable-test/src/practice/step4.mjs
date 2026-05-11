/**
 * Step 4：加入条件分支（意图识别）
 *
 * 架构：
 *   用户输入 → RunnableBranch（意图分类）
 *     ├─ 打招呼/感谢 → 固定回复（不调 LLM，秒回）
 *     └─ 其他问题   → careerChain（Pipeline + ChatPromptTemplate + LLM）
 *   全程包在 RunnableWithMessageHistory 外面（记忆层）
 *
 * 为什么记忆要包在分支外面？
 *   不管是「你好」还是「职业规划问题」，都记录进对话历史。
 *   如果不包在外面，「你好」的回复不会被记住，后续会话会丢失上下文。
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
  RunnableWithMessageHistory,
} from '@langchain/core/runnables';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
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
// ② 定义三个 Prompt 子模块（和 step2/step3 一样）
// ============================================================

// 人设模块：定义 AI 的身份和语气
const personaPrompt = PromptTemplate.fromTemplate(
  '你叫{name}，是一位资深的职业规划导师，擅长帮助技术人员规划学习和转型路径。'
);

// 格式模块：定义输出规范
const formatPrompt = PromptTemplate.fromTemplate(
  '回答要求：\n1. 给出清晰的学习路线\n2. 列出关键里程碑\n3. 推荐学习资源\n4. 使用 Markdown 格式'
);

// 任务模块：承载用户的问题
const taskPrompt = PromptTemplate.fromTemplate(
  '用户向你提出了以下问题：{question}'
);

// ============================================================
// ③ 用 ChatPromptTemplate 作为 finalPrompt
//    关键：MessagesPlaceholder('history') 是历史对话的插入点
// ============================================================
const finalChatPrompt = ChatPromptTemplate.fromMessages([
  ['system', '{persona_block}'],        // 模块 1：人设
  ['system', '{format_block}'],         // 模块 2：输出格式
  new MessagesPlaceholder('history'),    // 模块 3：历史对话（由 RunnableWithMessageHistory 注入）
  ['human', '{task_block}'],            // 模块 4：当前任务
]);

// ============================================================
// ④ Pipeline 组合四个子模块
//    name 必须和 finalChatPrompt 里的占位符一致
// ============================================================
const pipeline = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: 'persona_block', prompt: personaPrompt },
    { name: 'format_block',  prompt: formatPrompt },
    { name: 'task_block',    prompt: taskPrompt },
  ],
  finalPrompt: finalChatPrompt,
});

// ============================================================
// ⑤ 完整职业规划链（走 LLM）
// ============================================================
const careerChain = RunnableSequence.from([
  pipeline,
  model,
  new StringOutputParser(),
]);

// ============================================================
// ⑥ 意图分类（if-else 逻辑）
//    条件按顺序匹配，第一个命中就执行
//    最后一个是默认兜底（走完整 LLM 链）
// ============================================================
const branch = RunnableBranch.from([
  // 分支 1：打招呼 → 固定回复（不调 LLM，瞬间返回）
  [
    (input) => /你好|hello|嗨|hi|在吗/i.test(input.question),
    RunnableLambda.from(() => '你好！我是道无，你的职业规划导师。有什么可以帮你？'),
  ],
  // 分支 2：感谢 → 固定回复
  [
    (input) => /谢谢|感谢|thanks|thank/i.test(input.question),
    RunnableLambda.from(() => '不客气！有任何问题随时找我。'),
  ],
  // 默认：走完整职业规划链
  careerChain,
]);

// ============================================================
// ⑦ 记忆管理（按 sessionId 隔离不同用户/会话）
// ============================================================
const messageHistories = new Map();

const getMessageHistory = (sessionId) => {
  if (!messageHistories.has(sessionId)) {
    messageHistories.set(sessionId, new InMemoryChatMessageHistory());
  }
  return messageHistories.get(sessionId);
};

// ============================================================
// ⑧ 包上记忆层（包在 branch 外面，所有分支都记）
// ============================================================
const chain = new RunnableWithMessageHistory({
  runnable: branch,                     // 包裹的是 branch，不是 careerChain
  getMessageHistory,
  inputMessagesKey: 'question',         // 当前问题从 input.question 取
  historyMessagesKey: 'history',        // 历史注入到 MessagesPlaceholder('history')
});

// ============================================================
// ⑨ 测试：多轮对话
// ============================================================
async function main() {
  const sessionConfig = { configurable: { sessionId: 'user-1' } };

  // 第 1 轮：打招呼（走固定回复）
  console.log(chalk.cyan.bold('👤 第1轮:\n'));
  const r1 = await chain.invoke(
    { name: '道无', question: '你好' },
    sessionConfig
  );
  console.log(chalk.green.bold('🤖 道无:\n'));
  console.log(r1);
  console.log(chalk.gray('─'.repeat(60)));

  // 第 2 轮：介绍自己（走 LLM）
  console.log(chalk.cyan.bold('\n👤 第2轮:\n'));
  const stream2 = await chain.stream(
    { name: '道无', question: '我叫道无，做了5年前端开发' },
    sessionConfig
  );
  console.log(chalk.green.bold('🤖 道无:\n'));
  for await (const chunk of stream2) {
    process.stdout.write(chunk);
  }
  console.log(chalk.gray('\n' + '─'.repeat(60)));

  // 第 3 轮：追问（验证记忆——AI 应该记得上一轮说的「5年前端」）
  console.log(chalk.cyan.bold('\n👤 第3轮:\n'));
  const stream3 = await chain.stream(
    { name: '道无', question: '根据我的背景，我该补充哪些 AI 技能？' },
    sessionConfig
  );
  console.log(chalk.green.bold('🤖 道无:\n'));
  for await (const chunk of stream3) {
    process.stdout.write(chunk);
  }
  console.log(chalk.gray('\n' + '─'.repeat(60)));

  // 第 4 轮：感谢（走固定回复）
  console.log(chalk.cyan.bold('\n👤 第4轮:\n'));
  const r4 = await chain.invoke(
    { name: '道无', question: '谢谢' },
    sessionConfig
  );
  console.log(chalk.green.bold('🤖 道无:\n'));
  console.log(r4);
  console.log(chalk.gray('─'.repeat(60)));
}

main();
