import "dotenv/config";
import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node';
import { OpenAIEmbeddings } from "@langchain/openai";

const client = new MilvusClient({ address: 'localhost:19530' });

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'text-embedding-v3',
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  dimensions: 1024
});

try {
  // 第一步：删掉旧集合，干净重来
  console.log('1. 删除旧集合...');
  await client.dropCollection({ collection_name: 'conversations' });
  console.log('✅ 删除成功');

  // 第二步：重新创建
  console.log('2. 创建集合...');
  await client.createCollection({
    collection_name: 'conversations',
    fields: [
      { name: 'id', data_type: DataType.VarChar, max_length: 50, is_primary_key: true },
      { name: 'vector', data_type: DataType.FloatVector, dim: 1024 },
      { name: 'content', data_type: DataType.VarChar, max_length: 5000 },
      { name: 'round', data_type: DataType.Int64 },
      { name: 'timestamp', data_type: DataType.VarChar, max_length: 100 }
    ]
  });
  console.log('✅ 创建成功');

  // 第三步：创建索引
  console.log('3. 创建索引...');
  await client.createIndex({
    collection_name: 'conversations',
    field_name: 'vector',
    index_type: IndexType.IVF_FLAT,
    metric_type: MetricType.COSINE
  });
  console.log('✅ 索引成功');

  // 第四步：加载
  console.log('4. 加载集合...');
  await client.loadCollection({ collection_name: 'conversations' });
  console.log('✅ 加载成功');

  // 第五步：插入测试数据
  console.log('5. 插入测试数据...');
  const conversations = [
    { id: 'conv_001', content: '你好，我叫小明', round: 1 },
    { id: 'conv_002', content: '我喜欢打篮球和游泳', round: 1 },
    { id: 'conv_003', content: '我住在北京', round: 2 },
    { id: 'conv_004', content: '我的工作是软件工程师', round: 2 },
    { id: 'conv_005', content: '我最近在学习 AI 开发', round: 3 },
  ];

  const dataToInsert = await Promise.all(
    conversations.map(async (conv) => {
      const vector = await embeddings.embedQuery(conv.content);
      return {
        id: conv.id,
        vector: vector,
        content: conv.content,
        round: conv.round,        // ✅ 直接用 number，不要 BigInt
        timestamp: new Date().toISOString()
      };
    })
  );

  const insertResult = await client.insert({
    collection_name: 'conversations',
    data: dataToInsert
  });
  console.log('✅ 插入成功，条数:', insertResult.insert_cnt);

  // 第六步：验证
  console.log('6. 验证数据...');
    await client.flushSync({ collection_names: ['conversations'] });

    const stats = await client.getCollectionStatistics({ collection_name: 'conversations' });
    console.log('📊 flush后数据条数:', stats.data);

    // 用 query 实时查询
    const queryResult = await client.query({
    collection_name: 'conversations',
    filter: 'round > 0',
    output_fields: ['id', 'content', 'round']
    });
    console.log('🔍 查询结果:');
    console.table(queryResult.data);

} catch (error) {
  console.error('❌ 完整错误:', error);  // 打印完整错误，不再静默吞掉
}