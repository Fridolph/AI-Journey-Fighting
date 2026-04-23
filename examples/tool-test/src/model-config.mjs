import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

function loadEnvFiles() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  const projectRoot = path.resolve(currentDir, '..');

  dotenv.config({ path: path.join(projectRoot, '.env') });
  dotenv.config({ path: path.join(projectRoot, '.env.local'), override: true });
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return undefined;
}

export function getModelConfig() {
  loadEnvFiles();

  const modelName = pickFirstNonEmpty(
    process.env.MODEL_NAME,
    process.env.QINIU_AI_MODEL,
    'qwen-coder-turbo'
  );
  const apiKey = pickFirstNonEmpty(
    process.env.OPENAI_API_KEY,
    process.env.QINIU_AI_API_KEY
  );
  const baseURL = pickFirstNonEmpty(
    process.env.OPENAI_BASE_URL,
    process.env.QINIU_AI_BASE_URL
  );

  if (!apiKey) {
    throw new Error(
      '未检测到 API Key。请在 tool-test/.env 或 tool-test/.env.local 中配置 OPENAI_API_KEY 或 QINIU_AI_API_KEY。'
    );
  }

  const config = {
    modelName,
    apiKey,
  };

  if (baseURL) {
    config.configuration = { baseURL };
  }

  return config;
}

