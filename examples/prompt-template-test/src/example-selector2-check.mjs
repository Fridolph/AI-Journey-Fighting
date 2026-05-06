import 'dotenv/config';
import { OpenAIEmbeddings } from '@langchain/openai';

const VECTOR_DIM = 1024;

// embedding 用千问独立配置
const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.EMBEDDINGS_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: {
    baseURL: process.env.EMBEDDINGS_URL,
  },
  dimensions: VECTOR_DIM,
});

// 两个场景描述，和 example-selector2-fix.mjs 一致
const scenario1 =
  '我们本周主要是在清理历史技术债：重构老旧的订单模块、补齐核心接口的单测，' +
  '同时也完善了一些文档，方便后面新人接手。整体没有对外大范围发布的新功能。';

const scenario2 =
  '本周完成新一代运营看板的首批功能上线，重点打通埋点和实时数仓链路，' +
  '并面向运营和市场同学做了多场宣讲，希望更多同学开始使用新能力。';

async function checkCollection() {
  const { MilvusClient } = await import('@zilliz/milvus2-sdk-node');
  const client = new MilvusClient({
    address: process.env.MILVUS_ADDRESS ?? 'localhost:19530',
  });

  // 先看集合里有多少条数据
  const stats = await client.getCollectionStatistics({
    collection_name: 'weekly_report_examples',
  });
  console.log('集合统计:', stats.stats);
  console.log('');

  // 查出所有数据（不带向量，只看文本字段）
  const queryResp = await client.query({
    collection_name: 'weekly_report_examples',
    expr: 'id like "weekly_%"',
    output_fields: ['id', 'scenario', 'report_snippet'],
    limit: 20,
  });
  console.log('Milvus 中全部 8 条示例数据:');
  console.log('='.repeat(60));
  for (const row of queryResp.data) {
    console.log(`[${row.id}]`);
    console.log(`  场景: ${row.scenario}`);
    console.log(`  片段: ${row.report_snippet.replace(/\n/g, '\n        ')}`);
    console.log('');
  }
  console.log('='.repeat(60));
}

async function searchSimilar(scenario, label) {
  const { Milvus } = await import('@langchain/community/vectorstores/milvus');

  const vectorStore = await Milvus.fromExistingCollection(embeddings, {
    collectionName: 'weekly_report_examples',
    clientConfig: {
      address: process.env.MILVUS_ADDRESS ?? 'localhost:19530',
    },
    indexCreateOptions: {
      index_type: 'IVF_FLAT',
      metric_type: 'COSINE',
      params: { nlist: 1024 },
      search_params: { nprobe: 10 },
    },
  });

  // 直接用 vectorStore 做语义检索，获取原始结果
  const results = await vectorStore.similaritySearch(scenario, 3);

  console.log(`\n===== ${label} =====`);
  console.log(`输入场景: ${scenario}`);
  console.log(`语义检索 TOP 3 结果 (Selector 会取前 k=2 条):`);
  console.log('-'.repeat(60));
  results.forEach((doc, i) => {
    console.log(`第 ${i + 1} 名:`);
    console.log(`  场景: ${doc.metadata.scenario}`);
    console.log(`  片段: ${doc.pageContent.replace(/\n/g, '\n        ')}`);
    console.log('');
  });
  console.log('-'.repeat(60));

  return results;
}

async function main() {
  try {
    await checkCollection();

    console.log('\n');

    await searchSimilar(scenario1, '场景1：技术债清理');
    await searchSimilar(scenario2, '场景2：新功能首发');
  } catch (error) {
    console.error('错误:', error.message);
    console.error(error.stack);
  }
}

main();
