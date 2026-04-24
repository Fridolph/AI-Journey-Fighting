import "dotenv/config";
import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { OpenAIEmbeddings } from "@langchain/openai";

// ✅ 测试1：嵌入是否正常
console.log('=== 测试嵌入 ===');
const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'text-embedding-v3',
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL
  },
  dimensions: 1024
});

try {
  const result = await embeddings.embedQuery('测试文本');
  console.log('✅ 嵌入成功，向量维度:', result.length);
} catch (e) {
  console.error('❌ 嵌入失败:', e);
}

// ✅ 测试2：Milvus 数据条数
console.log('\n=== 测试 Milvus ===');
const client = new MilvusClient({ address: 'localhost:19530' });
const stats = await client.getCollectionStatistics({ 
  collection_name: 'conversations' 
});
console.log('数据条数:', stats.data);
