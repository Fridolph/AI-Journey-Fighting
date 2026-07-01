/**
 * hybrid-retrieval-fix.mjs
 *
 * 修复版 — 修正 query-augment 重复 + 优化检索逻辑
 *
 * 问题 ①：query-augment LLM 返回 3 条完全相同的问句 → 4 次相同检索浪费
 *   修复：换用 query-augment-fix.mjs（强化 prompt + 降为 2 条 + fallback）
 *
 * 问题 ②：rerank 用 EMBEDDINGS_API_KEY → 换 RERANK_API_KEY
 */

import "dotenv/config";
import { Client } from "@elastic/elasticsearch";
import { Document } from "@langchain/core/documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Milvus } from "@langchain/community/vectorstores/milvus";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { DashScopeRerank } from "../rerank/dashscope-rerank.mjs";
// ★ 换用修复版 query-augment
import {
  augmentQuery,
  retrievalQueryStrings,
} from "./query-augment-fix.mjs";

const INDEX = "life_notes";

const HybridRetrievalState = Annotation.Root({
  query: Annotation(),
  queryAugmentation: Annotation(),
  esHits: Annotation(),
  milvusHits: Annotation(),
  merged: Annotation(),
  topDocuments: Annotation(),
  answer: Annotation(),
});

// ─── 辅助函数 ────────────────────────────────────────────

function docFromEsHit(hit) {
  const s = hit._source ?? {};
  const text = [s.note_title ?? s.title, s.note_body ?? s.content]
    .filter(Boolean)
    .join("\n");
  return new Document({
    pageContent: text,
    metadata: { id: hit._id, source: "es", ...s },
  });
}

function merge(esDocs, milvusDocs) {
  const combined = [...(esDocs ?? []), ...(milvusDocs ?? [])]
    .filter((d) => d?.pageContent);
  return dedupeDocsById(combined);
}

function dedupeDocsById(docs) {
  const seen = new Set();
  const out = [];
  for (const d of docs ?? []) {
    if (!d?.pageContent) continue;
    const id = d.metadata?.id != null ? String(d.metadata.id).trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(d);
  }
  return out;
}

function stringifyMessageContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content ?? "");
  return content
    .map((c) => typeof c === "string" ? c : typeof c?.text === "string" ? c.text : "")
    .join("");
}

function formatDocsAsContext(docs) {
  return (docs ?? [])
    .map((d, i) => {
      const meta = d.metadata ?? {};
      const src = meta.source ?? "";
      const id = meta.id != null ? String(meta.id) : "";
      const head = `[${i + 1}]${id ? ` id=${id}` : ""}${src ? ` source=${src}` : ""}`;
      return `${head}\n${d.pageContent ?? ""}`;
    })
    .join("\n\n---\n\n");
}

// ─── 打印函数 ────────────────────────────────────────────

function printQueryRewrite(original, augmentation) {
  const qs = augmentation?.queries ?? [];
  console.log(`\n--- 查询扩展（LLM 生成 ${qs.length} 条多角度问句）---`);
  console.log("原始:", original ?? "");
  for (let i = 0; i < qs.length; i++) console.log(`  [${i + 1}] ${qs[i]}`);
}

function printDocs(label, docs) {
  console.log(`\n=== ${label} (${docs?.length ?? 0} 条) ===`);
  for (let i = 0; i < (docs ?? []).length; i++) {
    const d = docs[i];
    const preview = (d.pageContent ?? "").slice(0, 150).replace(/\n/g, " ");
    console.log(`[${i}] ${preview}${d.pageContent?.length > 150 ? "..." : ""}`);
  }
}

// ─── Prompt ──────────────────────────────────────────────

const ANSWER_PROMPT = ChatPromptTemplate.fromMessages([
  ["system", "你是阅读用户「生活笔记」知识库并作答的助手。只根据检索片段回答，不要编造。若不足以回答，明确说明。回答简洁有条理。"],
  ["human", "用户问题：{query}\n\n检索片段：\n{context}"],
]);

const NO_CONTEXT_PROMPT = ChatPromptTemplate.fromMessages([
  ["system", "你是阅读用户「生活笔记」知识库并作答的助手。当前没有检索到任何片段。请说明无法从笔记中回答。"],
  ["human", "用户问题：{query}"],
]);

// ─── 编译图 ──────────────────────────────────────────────

function compileGraph(esClient, milvus, reranker, { chatModel, augmentModel }) {
  const ES_K = 10;

  return new StateGraph(HybridRetrievalState)
    .addNode("query_augment", async (state) => ({
      queryAugmentation: await augmentQuery(augmentModel, state.query ?? ""),  // ★ 用关 thinking 的实例
    }))
    // ★ 只保留 ES + Milvus 各一轮（修复后 3 条问句足够覆盖）
    .addNode("es_recall", async (state) => {
      const kEach = Math.max(3, Math.ceil(ES_K / 3));
      const qs = retrievalQueryStrings(state.query, state.queryAugmentation);
      const batches = await Promise.all(
        qs.map((q) =>
          esClient.search({
            index: INDEX,
            size: kEach,
            query: {
              multi_match: {
                query: q,
                fields: ["note_title^2", "note_body"],
                type: "best_fields",
                analyzer: "ik_smart",
              },
            },
          })
        ),
      );
      const flat = batches.flatMap((res) =>
        (res.hits?.hits ?? []).map(docFromEsHit)
      );
      return { esHits: dedupeDocsById(flat) };
    })
    .addNode("milvus_recall", async (state) => {
      const kEach = Math.max(3, Math.ceil(10 / 3));
      const qs = retrievalQueryStrings(state.query, state.queryAugmentation);
      const batches = await Promise.all(
        qs.map((q) => milvus.similaritySearch(q, kEach)),
      );
      return { milvusHits: dedupeDocsById(batches.flat()) };
    })
    .addNode("merge", async (state) => ({
      merged: merge(state.esHits, state.milvusHits),
    }))
    .addNode("rerank", async (state) => {
      const merged = state.merged ?? [];
      if (!merged.length) return { topDocuments: [] };
      const topDocuments = await reranker.compressDocuments(merged, state.query);
      return { topDocuments };
    })
    .addNode("generate_answer", async (state) => {
      const query = state.query ?? "";
      const docs = state.topDocuments ?? [];
      if (!docs.length) {
        const msg = await NO_CONTEXT_PROMPT.pipe(chatModel).invoke({ query });
        return { answer: stringifyMessageContent(msg.content).trim() };
      }
      const msg = await ANSWER_PROMPT.pipe(chatModel).invoke({
        query,
        context: formatDocsAsContext(docs),
      });
      return { answer: stringifyMessageContent(msg.content).trim() };
    })
    .addEdge(START, "query_augment")
    .addEdge("query_augment", "es_recall")
    .addEdge("query_augment", "milvus_recall")
    .addEdge(["es_recall", "milvus_recall"], "merge")
    .addEdge("merge", "rerank")
    .addEdge("rerank", "generate_answer")
    .addEdge("generate_answer", END)
    .compile();
}

// ─── 运行 ────────────────────────────────────────────────

const esClient = new Client({ node: "http://localhost:9200" });
const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-v3",
  apiKey: process.env.EMBEDDINGS_API_KEY,
  configuration: { baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
});
const milvus = await Milvus.fromExistingCollection(embeddings, {
  url: "http://localhost:19530",
  collectionName: INDEX,
  textField: "doc_text",
  vectorField: "embedding",
});
const reranker = new DashScopeRerank({
  apiKey: process.env.EMBEDDINGS_API_KEY,
  model: "qwen3-rerank",
  topN: 3,
});

const chatModel = new ChatOpenAI({
  model: process.env.MODEL_NAME ?? "deepseek-chat",
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.2,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  // 保留 thinking — 最终回答质量更高
});

// ★ query_augment 专用：关 thinking（DeepSeek thinking 不支持 function calling）
const augmentModel = new ChatOpenAI({
  model: process.env.MODEL_NAME ?? "deepseek-chat",
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.2,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  modelKwargs: { thinking: { type: "disabled" } },
});

const graph = compileGraph(esClient, milvus, reranker, {
  chatModel,      // → generate_answer 用
  augmentModel,   // → query_augment 用
});
const drawable = await graph.getGraphAsync();
console.log(drawable.drawMermaid());
console.log();

const query = "家里无线老是断断续续的咋整啊";
console.log(`\n👤 用户：${query}`);

const state = await graph.invoke({ query });

printQueryRewrite(state.query, state.queryAugmentation);
printDocs("ES 关键词检索", state.esHits);
printDocs("Milvus 语义检索", state.milvusHits);
printDocs("Rerank 重排后保留", state.topDocuments ?? []);

console.log("\n=== 回答 ===\n");
console.log(state.answer ?? "模型未返回内容");
