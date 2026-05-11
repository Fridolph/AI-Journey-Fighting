import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { RunnableSequence, RunnableLambda, RunnableBranch } from "@langchain/core/runnables";
import { MilvusClient, MetricType } from "@zilliz/milvus2-sdk-node";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

// 诊断：确认环境变量加载情况
console.log('[诊断] OPENAI_BASE_URL:', process.env.OPENAI_BASE_URL?.slice(0, 30) + '...');
console.log('[诊断] EMBEDDINGS_URL:', process.env.EMBEDDINGS_URL?.slice(0, 30) + '...');
console.log('[诊断] EMBEDDINGS_API_KEY 存在:', !!process.env.EMBEDDINGS_API_KEY);
console.log('[诊断] EMBEDDINGS_MODEL_NAME:', process.env.EMBEDDINGS_MODEL_NAME);

/**
 * ebook-reader-rag-fix.mjs
 *
 * 修复点：
 *   1. embedding 独立配置（千问），不走 DeepSeek
 *   2. 集合名修正为 ebook_jinyong_tianlongbabu
 *   3. 无检索结果时用 RunnableBranch 短路，不走 promptTemplate
 */

const COLLECTION_NAME = "ebook_jinyong_tianlongbabu";
const VECTOR_DIM = 1024;

const model = new ChatOpenAI({
  temperature: 0.7,
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
});

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.EMBEDDINGS_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: { baseURL: process.env.EMBEDDINGS_URL },
  dimensions: VECTOR_DIM,
});

const milvusClient = new MilvusClient({ address: "localhost:19530" });

// ① 检索链
const milvusSearch = new RunnableLambda({
  func: async (input) => {
    const { question, k = 5 } = input;
    try {
      const queryVector = await embeddings.embedQuery(question);
      const searchResult = await milvusClient.search({
        collection_name: COLLECTION_NAME,
        vector: queryVector,
        limit: k,
        metric_type: MetricType.COSINE,
        output_fields: ["id", "book_id", "chapter_num", "index", "content"],
      });

      const results = searchResult.results ?? [];
      const retrievedContent = results.map((item, idx) => ({
        id: item.id,
        book_id: item.book_id,
        chapter_num: item.chapter_num,
        index: item.index ?? idx,
        content: item.content,
        score: item.score,
      }));

      return { question, retrievedContent };
    } catch (error) {
      console.error("检索内容时出错:", error.message);
      return { question, retrievedContent: [] };
    }
  },
});

// ② 构建 prompt 输入 + 日志
const buildPromptInput = new RunnableLambda({
  func: async (input) => {
    const { question, retrievedContent } = input;

    if (!retrievedContent.length) {
      return { question, context: "", hasContext: false };
    }

    console.log("=".repeat(80));
    console.log(`问题: ${question}`);
    console.log("=".repeat(80));
    console.log("\n【检索相关内容】");

    retrievedContent.forEach((item, i) => {
      console.log(`\n[片段 ${i + 1}] 相似度: ${item.score ?? "N/A"}`);
      console.log(`书籍: ${item.book_id}`);
      console.log(`章节: 第 ${item.chapter_num} 章`);
      const content = item.content ?? "";
      console.log(`内容: ${content.substring(0, 200)}${content.length > 200 ? "..." : ""}`);
    });

    const context = retrievedContent
      .map((item, i) => `[片段 ${i + 1}]\n章节: 第 ${item.chapter_num} 章\n内容: ${item.content}`)
      .join("\n\n━━━━━\n\n");

    return { question, context, hasContext: true };
  },
});

const promptTemplate = PromptTemplate.fromTemplate(
  `你是一个专业的《天龙八部》小说助手。基于小说内容回答问题，用准确、详细的语言。

请根据以下《天龙八部》小说片段内容回答问题：
{context}

用户问题: {question}

回答要求：
1. 如果片段中有相关信息，请结合小说内容给出详细、准确的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关信息，请如实告知用户
4. 回答要准确，符合小说的情节和人物设定

AI 助手的回答:`
);

// LLM 完整链：prompt → model → parser
const llmChain = promptTemplate.pipe(model).pipe(new StringOutputParser());

// ③ 用 RunnableBranch 处理无结果短路
const ragChain = RunnableSequence.from([
  milvusSearch,
  buildPromptInput,
  RunnableBranch.from([
    // 无检索结果 → 直接返回提示文本
    [(input) => input.hasContext === false,
      RunnableLambda.from(() => "抱歉，我没有找到相关的《天龙八部》内容。请尝试换一个问题。")],
    // 有结果 → 走 LLM
    llmChain,
  ]),
]);

async function initMilvusCollection() {
  console.log("连接到 Milvus...");
  await milvusClient.connectPromise;
  console.log("✓ 已连接\n");

  try {
    await milvusClient.loadCollection({ collection_name: COLLECTION_NAME });
    console.log("✓ 集合已加载\n");
  } catch (error) {
    if (!error.message.includes("already loaded")) throw error;
    console.log("✓ 集合已处于加载状态\n");
  }
}

async function main() {
  try {
    await initMilvusCollection();

    const input = { question: "鸠摩智会什么武功？", k: 5 };

    console.log("=".repeat(80));
    console.log(`问题: ${input.question}`);
    console.log("=".repeat(80));
    console.log("\n【AI 流式回答】\n");

    const stream = await ragChain.stream(input);
    for await (const chunk of stream) {
      process.stdout.write(chunk);
    }
    console.log("\n");
  } catch (error) {
    console.error("错误:", error.message);
  }
}

await main();
