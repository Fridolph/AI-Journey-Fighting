// Step 2：用 Pipeline 把 Prompt 模块化
// 目标： 把单一 prompt 拆成「人设 + 任务 + 格式」三个独立模块，用 PipelinePromptTemplate 组合。
// 在 src/practice/step2.mjs 里写：
// 人设模块：定义一个 AI 职业规划导师
//   占位符：{name}
//   "你叫{name}，是一位资深的职业规划导师，擅长帮助技术人员规划学习和转型路径。"
// 任务模块：接收用户问题
//   占位符：{question}
//   "用户向你提出了以下问题：{question}"
// 格式模块：定义输出要求
//   "回答要求：1. 给出清晰的学习路线 2. 列出关键里程碑 3. 推荐学习资源 4. 使用 Markdown 格式"
// 最终 prompt 模板：
//   "{persona_block}\n\n{task_block}\n\n{format_block}\n\n现在请给出你的建议："
// 用 PipelinePromptTemplate 组合
//   提示：new PipelinePromptTemplate({ pipelinePrompts: [...], finalPrompt: ... })
// 组装 chain：pipeline → model → StringOutputParser
// 用 stream 输出
//   输入 { name: '小光', question: '前端工程师如何转型 AI？' }
// API 提示：
// - import { PipelinePromptTemplate, PromptTemplate } from '@langchain/core/prompts'
// - new PipelinePromptTemplate({ pipelinePrompts: [{ name, prompt }, ...], finalPrompt })
// 你已经学过这个 API，在 prompt-template-test 里反复用过。把 step1 的 questionTemp 替换成 PipelinePromptTemplate 就行。写好跑通贴代码。
import 'dotenv/config';
import { PipelinePromptTemplate, PromptTemplate } from '@langchain/core/prompts'
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOpenAI } from '@langchain/openai';
import chalk from 'chalk';

// 2 model
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.3,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// 3 prompt 相关逻辑都放这里
const aiGuiderPromptTemp = PromptTemplate.fromTemplate('你叫{name}，是一位资深的职业规划导师，擅长帮助技术人员规划学习和转型路径。')
const recieveQuestionPromptTemp = PromptTemplate.fromTemplate('用户向你提出了以下问题：{question}')
const answerPromptTemp = PromptTemplate.fromTemplate('回答要求：1. 给出清晰的学习路线 2. 列出关键里程碑 3. 推荐学习资源 4. 使用 Markdown 格式')

const finalPipeline = new PipelinePromptTemplate({ 
    pipelinePrompts: [
        { name: 'aiGuider', prompt: aiGuiderPromptTemp },
        { name: 'recieveQuestion', prompt: recieveQuestionPromptTemp },
        { name: 'answer', prompt: answerPromptTemp },
    ], 
    finalPrompt: PromptTemplate.fromTemplate(
        `{aiGuider}
{recieveQuestion}
{answer}
现在请给出你的建议：`
    )
})

// 问题
const question = '前端转AI全栈开发，有哪些技能是需要补全学习和强化的 ？'
console.log(chalk.cyan.bold('\n👤 你的问题:\n'));
console.log(chalk.gray(`${question}\n`));

const chain = RunnableSequence.from([
    finalPipeline,
    model,
    new StringOutputParser(),
])

const stream = await chain.stream({
    name: '道无',
    question,
})

// 回答
console.log(chalk.green.bold('🤖 AI 回答:\n'));

for await (const chunk of stream) {
    process.stdout.write(chunk);
}

console.log('\n');
console.log(chalk.gray('─'.repeat(60)));  // 分隔线