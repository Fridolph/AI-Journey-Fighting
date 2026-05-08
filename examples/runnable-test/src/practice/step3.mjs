// Step 3：加对话记忆
// 目标： 把 Step 2 的 pipeline 换成 ChatPromptTemplate，加上 MessagesPlaceholder 存放对话历史，外面用 RunnableWithMessageHistory 包一层，让 AI 能记住上下文。
// 在 src/practice/step3.mjs 里写：
// 三个模块沿用 Step 2，不变
// import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
// import { RunnableWithMessageHistory } from '@langchain/core/runnables'
// import { InMemoryChatMessageHistory } from '@langchain/core/chat_history'
// ① ChatPromptTemplate：
//    ['system', '{persona_block}'],
//    ['system', '{format_block}'],
//    new MessagesPlaceholder('history'),    // ← 历史对话
//    ['human', '{task_block}'],
// ② Pipeline 的 finalPrompt 换成上面的 ChatPromptTemplate
//    提示：Pipeline 的 finalPrompt 可以是 ChatPromptTemplate
//    但调用时用 pipeline.formatPromptValue(...).toChatMessages() 拿消息
// ③ 组装 simpleChain：pipeline → model → StringOutputParser
//    提示：pipeline 返回 ChatPromptValue，model 会自动识别
// ④ 用 RunnableWithMessageHistory 包住 simpleChain
//    历史管理跟 fri/7.mjs 一样
// ⑤ 三轮对话测试：
//    "我叫道无，做了5年前端开发"
//    "我叫什么名字？"
//    "根据我的背景，该补充哪些 AI 技能？"
// 提示：Pipeline + ChatPromptTemplate 组合时，invoke 不需要手动 toChatMessages
//      因为 RunnableSequence 会自动处理。直接用 pipeline.formatPromptValue 不对，
//      把 pipeline 直接放进 RunnableSequence 就行。
// 关键提示： Pipeline 的 finalPrompt 是 ChatPromptTemplate 时，把它放进 RunnableSequence 里就行，RunnableSequence 会自动调 invoke 来串联数据流。不需要手动 formatPromptValue。
// 有问题可以先试着跑，报错了贴出来我帮你分析。
import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { PipelinePromptTemplate, PromptTemplate, ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableSequence, RunnableWithMessageHistory } from '@langchain/core/runnables';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { StringOutputParser } from '@langchain/core/output_parsers';
import chalk from 'chalk';

// 初始化 Chat 模型
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// ① 三个子 prompt（和 Step 2 一样）
const personaPrompt = PromptTemplate.fromTemplate('你叫{name}，是一位资深的职业规划导师...');
const formatPrompt = PromptTemplate.fromTemplate('回答要求...');
const taskPrompt   = PromptTemplate.fromTemplate('用户向你提出了以下问题：{question}');
// ② finalPrompt 换成 ChatPromptTemplate（关键变化！）
const finalChatPrompt = ChatPromptTemplate.fromMessages([
  ['system', '{persona_block}'],        // 人设
  ['system', '{format_block}'],         // 格式
  new MessagesPlaceholder('history'),    // 历史对话
  ['human',  '{task_block}'],           // 当前任务
]);
// ③ Pipeline 组合（pipelinePrompts 的 name 和上面的占位符一致）
const pipeline = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: 'persona_block', prompt: personaPrompt },
    { name: 'format_block',  prompt: formatPrompt },
    { name: 'task_block',    prompt: taskPrompt },
  ],
  finalPrompt: finalChatPrompt,
});
// ④ 简单链
const simpleChain = RunnableSequence.from([pipeline, model, new StringOutputParser()]);
// ⑤ 包上记忆（和 fri/7.mjs 一样）

const getMessageHistory = (sessionId) => {
  if (!messageHistories.has(sessionId)) {
    messageHistories.set(sessionId, new InMemoryChatMessageHistory());
  }
  return messageHistories.get(sessionId);
};

const messageHistories = new Map();
const chain = new RunnableWithMessageHistory({
  runnable: simpleChain,
  getMessageHistory,
  inputMessagesKey: 'question',
  historyMessagesKey: 'history',
});
// ⑥ 测试
const question = '我是一名前端工程师，当前在学习AI，若要转型全栈和 AI开发，还需要做什么准备（面向AI Agent相关开发，非大模型方向）'
console.log(chalk.bgBlue('🚀 question:\n', question, '\n'))
// 注意 invoke 第二个参数是 config，传入 sessionId

const stream = await chain.stream(
  { name: '道无', question },
  { configurable: { sessionId: 'user-1' } }
);


console.log(chalk.green.bold('🤖 AI 回答:\n'));

for await (const chunk of stream) {
    process.stdout.write(chunk);
}

console.log('\n');
console.log(chalk.gray('─'.repeat(60)));  // 分隔线