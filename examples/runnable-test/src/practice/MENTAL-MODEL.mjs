/**
 * AI 开发心智模型（LCEL 版）
 *
 * 如果你能理解 Vue：UI = fn(state)，那你也能理解：
 *
 *   Answer = chain(input)
 *
 * ============================================================
 *
 * ┌──────────────────────────────────────────────────────┐
 * │                    Vue 心智模型                        │
 * │                                                      │
 * │  <template>  →  声明 UI 结构（模板）                  │
 * │  <script>    →  声明数据 + 逻辑（ref, computed）       │
 * │  <style>     →  声明样式                              │
 * │                                                      │
 * │  渲染：UI = fn(state)                                │
 * │  套路：template 搭骨架 → script 填逻辑 → style 美化   │
 * └──────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────┐
 * │                  AI 开发心智模型                       │
 * │                                                      │
 * │  Prompt      →  声明 AI 的任务和约束（模板）           │
 * │  Model       →  调用大模型（引擎）                     │
 * │  Output      →  解析输出（StringOutputParser 等）     │
 * │                                                      │
 * │  调用：Answer = chain(input)                         │
 * │  套路：Prompt 定义任务 → Model 执行 → Parser 取结果   │
 * └──────────────────────────────────────────────────────┘
 *
 * ============================================================
 *  开发套路（每次写新功能，按这个顺序来）
 * ============================================================
 *
 * ① 先写死跑通（最简链）
 *    PromptTemplate → ChatOpenAI → StringOutputParser
 *    chain.invoke({ question: '你好' })
 *    目的：确认模型能连通、能拿到结果
 *
 * ② 把 Prompt 模块化（如果复杂）
 *    persona / task / format → PipelinePromptTemplate
 *    目的：拆成可复用零件
 *
 * ③ 加上控制流（如果需要）
 *    顺序：RunnableSequence
 *    并行：RunnableMap
 *    分支：RunnableBranch
 *    循环：RunnableEach
 *
 * ④ 加上记忆（如果需要）
 *    MessagesPlaceholder + 手动 messages[] 数组管理
 *
 * ⑤ 美化 + 增强
 *    withRetry、withFallbacks、chalk 美化输出
 *
 * ============================================================
 *  万能起手式（复制这个骨架，改 3 个地方就能用）
 * ============================================================
 */

// import 'dotenv/config';
// import { ChatOpenAI } from '@langchain/openai';
// import { PromptTemplate } from '@langchain/core/prompts';
// import { StringOutputParser } from '@langchain/core/output_parsers';
//
// // 1. 模型（固定模板，基本不动）
// const model = new ChatOpenAI({ ... });
//
// // 2. 提示词（你每次主要改这里）
// const prompt = PromptTemplate.fromTemplate('你对 AI 说的话：{question}');
//
// // 3. 链（固定模板）
// const chain = prompt.pipe(model).pipe(new StringOutputParser());
//
// // 4. 调用
// const result = await chain.invoke({ question: '...' });
// console.log(result);
