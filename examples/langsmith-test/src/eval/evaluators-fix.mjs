/**
 * OpenEvals RAG 指标 — 千问 judge 版
 *
 * DeepSeek V4 Flash 全线不支持 response_format，openevals createLLMAsJudge 强制依赖此参数。
 * 解决方案：judge 使用千问 qwen-plus（支持 json_schema），RAG Agent 保持 deepseek-v4-flash 不变。
 *
 * 两者互不影响 —— LLM 做评分和 LLM 做问答是两条独立的 API 调用。
 */
import {
  createLLMAsJudge,
  RAG_GROUNDEDNESS_PROMPT,
  RAG_HELPFULNESS_PROMPT,
  RAG_RETRIEVAL_RELEVANCE_PROMPT,
} from "openevals";
import { ChatOpenAI } from "@langchain/openai";

// judge 单独使用千问 qwen-plus（支持 json_schema response_format）
// RAG Agent 继续用 .env 的 MODEL_NAME（deepseek-v4-flash），互不影响
const judge = new ChatOpenAI({
  apiKey: process.env.EMBEDDINGS_API_KEY,
  configuration: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  model: "qwen-plus",
  temperature: 0,
});

const ragGroundednessJudge = createLLMAsJudge({
  prompt: RAG_GROUNDEDNESS_PROMPT,
  feedbackKey: "rag_groundedness",
  judge,
  continuous: true,
});

const ragHelpfulnessJudge = createLLMAsJudge({
  prompt: RAG_HELPFULNESS_PROMPT,
  feedbackKey: "rag_helpfulness",
  judge,
  continuous: true,
});

const ragRetrievalRelevanceJudge = createLLMAsJudge({
  prompt: RAG_RETRIEVAL_RELEVANCE_PROMPT,
  feedbackKey: "rag_retrieval_relevance",
  judge,
  continuous: true,
});

export async function ragGroundednessEvaluator({ outputs }) {
  return ragGroundednessJudge({
    context: { documents: outputs.context },
    outputs: { answer: outputs.answer },
  });
}

export async function ragHelpfulnessEvaluator({ inputs, outputs }) {
  return ragHelpfulnessJudge({ inputs, outputs: { answer: outputs.answer } });
}

export async function ragRetrievalRelevanceEvaluator({ inputs, outputs }) {
  return ragRetrievalRelevanceJudge({
    inputs,
    context: { documents: outputs.context },
  });
}

export const ragEvaluators = [
  ragGroundednessEvaluator,
  ragHelpfulnessEvaluator,
  ragRetrievalRelevanceEvaluator,
];
