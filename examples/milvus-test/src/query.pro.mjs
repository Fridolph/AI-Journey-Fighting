import "dotenv/config";
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node';
import { OpenAIEmbeddings } from "@langchain/openai";

const COLLECTION_NAME = 'ai_diary';
const VECTOR_DIM = 1024;

// 基础召回数量：先多召回一些，再在本地做精筛
const RECALL_LIMIT = 5;

// 规则 1：最低分阈值（低于该分数的结果直接过滤）
const MIN_SCORE = 0.55;

// 规则 2：分数断层阈值（top1 与 top2 分差很大时，只保留 top1）
const TOP_GAP_THRESHOLD = 0.15;

// 规则 3（可选）：简单的“标签意图过滤”
// 如果 query 能识别出明确意图标签，会优先保留 tags 匹配的结果
const ENABLE_TAG_INTENT_FILTER = true;

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL
  },
  dimensions: VECTOR_DIM
});

const client = new MilvusClient({
  address: 'localhost:19530'
});

async function getEmbedding(text) {
  const result = await embeddings.embedQuery(text);
  return result;
}

function inferIntentTags(query) {
  const keywordToTags = [
    { keywords: ['做饭', '做菜', '晚餐', '美食', '菜谱', '吃饭'], tags: ['美食', '家庭'] },
    { keywords: ['学习', '读书', '知识', 'milvus', '技术'], tags: ['学习', '技术'] },
    { keywords: ['工作', '项目', '职场'], tags: ['工作', '成就'] },
    { keywords: ['户外', '爬山', '散步', '公园', '运动'], tags: ['户外', '朋友', '生活', '散步'] },
  ];

  const normalized = query.toLowerCase();
  const tagSet = new Set();

  for (const item of keywordToTags) {
    const matched = item.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
    if (matched) {
      item.tags.forEach((tag) => tagSet.add(tag));
    }
  }

  return Array.from(tagSet);
}

function applyTagIntentFilter(results, query) {
  if (!ENABLE_TAG_INTENT_FILTER) return results;

  const intentTags = inferIntentTags(query);
  if (intentTags.length === 0) return results;

  // 混合检索思路：先向量召回，再按业务标签做轻过滤
  const matched = results.filter((item) => {
    const itemTags = Array.isArray(item.tags) ? item.tags : [];
    return itemTags.some((tag) => intentTags.includes(tag));
  });

  // 如果过滤后为空，则回退原结果，避免“过严导致无结果”
  return matched.length > 0 ? matched : results;
}

function applyScoreThreshold(results, minScore) {
  return results.filter((item) => Number(item.score) >= minScore);
}

function applyTopGapRule(results, gapThreshold) {
  if (results.length < 2) return results;

  const [top1, top2] = results;
  const gap = Number(top1.score) - Number(top2.score);

  // 分差明显时，认为 top1 语义优势足够大，直接只保留 top1
  if (gap >= gapThreshold) {
    return [top1];
  }

  return results;
}

function printResults(title, results) {
  console.log(`\n${title}`);
  console.log(`Found ${results.length} results:\n`);

  results.forEach((item, index) => {
    console.log(`${index + 1}. [Score: ${Number(item.score).toFixed(4)}]`);
    console.log(`   ID: ${item.id}`);
    console.log(`   Date: ${item.date}`);
    console.log(`   Mood: ${item.mood}`);
    console.log(`   Tags: ${item.tags?.join(', ')}`);
    console.log(`   Content: ${item.content}\n`);
  });
}

async function main() {
  try {
    console.log('Connecting to Milvus...');
    await client.connectPromise;
    console.log('✓ Connected\n');

    console.log('Searching for similar diary entries...');
    const query = '我想看看做饭的日记';
    console.log(`Query: "${query}"`);
    console.log(`Recall limit: ${RECALL_LIMIT}, MIN_SCORE: ${MIN_SCORE}, TOP_GAP_THRESHOLD: ${TOP_GAP_THRESHOLD}\n`);

    const queryVector = await getEmbedding(query);
    const searchResult = await client.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit: RECALL_LIMIT,
      metric_type: MetricType.COSINE,
      output_fields: ['id', 'content', 'date', 'mood', 'tags']
    });

    const rawResults = searchResult.results || [];
    printResults('【原始向量召回结果】', rawResults);

    // 步骤 1：标签意图过滤（可选）
    const tagFiltered = applyTagIntentFilter(rawResults, query);
    printResults('【步骤1：标签意图过滤后】', tagFiltered);

    // 步骤 2：阈值过滤（去掉低分结果）
    const thresholdFiltered = applyScoreThreshold(tagFiltered, MIN_SCORE);
    printResults('【步骤2：分数阈值过滤后】', thresholdFiltered);

    // 步骤 3：分数断层规则（top1 明显领先时只保留 top1）
    let finalResults = applyTopGapRule(thresholdFiltered, TOP_GAP_THRESHOLD);

    // 兜底策略：如果过滤后为空，至少返回原始 top1，避免空结果
    if (finalResults.length === 0 && rawResults.length > 0) {
      finalResults = [rawResults[0]];
      console.log('\n⚠️ 过滤后为空，触发兜底策略：返回原始 top1\n');
    }

    printResults('【最终结果（推荐给 RAG 上下文）】', finalResults);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();

