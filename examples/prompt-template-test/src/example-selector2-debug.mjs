import 'dotenv/config';
import { OpenAIEmbeddings } from '@langchain/openai';

const VECTOR_DIM = 1024;

console.log('===== 环境变量诊断 =====');
console.log('OPENAI_BASE_URL:', process.env.OPENAI_BASE_URL);
console.log('MODEL_NAME:', process.env.MODEL_NAME);
console.log('EMBEDDINGS_MODEL_NAME:', process.env.EMBEDDINGS_MODEL_NAME);
console.log('API_KEY 前8位:', process.env.OPENAI_API_KEY?.slice(0, 8) + '...');
console.log('========================\n');

async function testEmbedding(modelName) {
  console.log(`\n测试 embedding 模型: ${modelName}`);
  try {
    const embeddings = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
      model: modelName,
      configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
      },
      dimensions: VECTOR_DIM,
    });

    const result = await embeddings.embedQuery('测试文本');
    console.log(`✓ 成功！向量维度: ${result.length}`);
    return true;
  } catch (error) {
    console.log(`✗ 失败: ${error.message}`);
    return false;
  }
}

// 列出常见的 embedding 模型名，逐一尝试
const candidates = [
  process.env.EMBEDDINGS_MODEL_NAME,
  'text-embedding-3-small',
  'text-embedding-ada-002',
  'text-embedding-3-large',
  'bge-large-zh-v1.5',
  'bge-m3',
  'embedding-2',
];

async function main() {
  let found = false;
  for (const name of candidates) {
    if (name) {
      const ok = await testEmbedding(name);
      if (ok) {
        console.log(`\n建议将 EMBEDDINGS_MODEL_NAME 设为: ${name}`);
        found = true;
        break;
      }
    }
  }

  if (!found) {
    console.log('\n未找到可用的 embedding 模型。可能原因：');
    console.log('1. 你的 API 代理不支持 embeddings 接口');
    console.log('2. 所有候选模型名都不对，需查 API 提供商的文档确认模型名');
  }
}

main();
