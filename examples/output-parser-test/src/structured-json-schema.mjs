import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import chalk from 'chalk';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const scientistSchema = z.object({
  name: z.string().describe('科学家的全名'),
  birth_year: z.number().describe('出生年份'),
  field: z.string().describe('主要研究领域'),
  achievements: z.array(z.string()).describe('主要成就列表'),
}).strict();

// 将 Zod 转换为原生 JSON Schema。
// 这个对象本身没问题，问题在于“并不是所有 OpenAI 兼容接口都支持
// response_format: { type: "json_schema" }”。
const nativeJsonSchema = zodToJsonSchema(scientistSchema);

const providerBaseUrl = process.env.OPENAI_BASE_URL?.toLowerCase() ?? '';
const modelName = process.env.MODEL_NAME?.toLowerCase() ?? '';

// 这次真实环境是：
// - MODEL_NAME=deepseek-v4-flash
// - OPENAI_BASE_URL=https://api.deepseek.com
//
// DeepSeek 兼容接口当前不支持 response_format.type = json_schema，
// 所以这里不再死磕“强制原生模式”，而是做成学习版兼容策略：
// - 支持 json_schema 的供应商：走原生 JSON Schema
// - 不支持的供应商：退回普通 JSON 文本输出，再用 Zod 做最终校验
const supportsNativeJsonSchema =
  !providerBaseUrl.includes('deepseek.com') &&
  !modelName.includes('reasoner');

function createModel(useNativeJsonSchema) {
  return new ChatOpenAI({
    modelName: process.env.MODEL_NAME,
    temperature: 0,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
    modelKwargs: useNativeJsonSchema ? {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'scientist_info',
          strict: true,
          schema: nativeJsonSchema,
        },
      },
    } : undefined,
  });
}

function extractTextContent(response) {
  if (typeof response?.content === 'string') {
    return response.content;
  }

  if (Array.isArray(response?.content)) {
    return response.content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item?.text === 'string') return item.text;
        return '';
      })
      .join('');
  }

  return '';
}

function parseJsonObjectFromText(text) {
  const trimmed = String(text || '').trim();

  if (!trimmed) {
    throw new Error('模型没有返回可解析的 JSON 内容');
  }

  const startIndex = trimmed.indexOf('{');
  const endIndex = trimmed.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`未在模型输出中找到合法 JSON 对象: ${trimmed}`);
  }

  return JSON.parse(trimmed.slice(startIndex, endIndex + 1));
}

function normalizeScientistRecord(record) {
  // fallback 模式下，兼容接口虽然返回了合法 JSON，
  // 但字段类型不一定完全稳定。
  // 这次真实返回里：
  // achievements 本应是 string[]，结果给成了 string。
  //
  // 所以这里补一层轻量归一化，让 demo 更贴近真实接入场景：
  // - 如果已经是数组，直接沿用
  // - 如果是字符串，就按常见中文分隔符拆成数组
  const rawAchievements = record?.achievements;
  const achievements = Array.isArray(rawAchievements)
    ? rawAchievements
    : typeof rawAchievements === 'string'
      ? rawAchievements
          .split(/[，、；;]\s*/g)
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  return {
    ...record,
    achievements,
  };
}

async function testNativeJsonSchema() {
  const modeLabel = supportsNativeJsonSchema ? 'native-json-schema' : 'json-text-fallback';

  console.log(chalk.bgMagenta('🧪 测试原生 JSON Schema 模式（兼容版）...\n'));
  console.log(chalk.gray(`provider: ${process.env.OPENAI_BASE_URL || '(empty)'}`));
  console.log(chalk.gray(`model: ${process.env.MODEL_NAME || '(empty)'}`));
  console.log(chalk.gray(`selected mode: ${modeLabel}\n`));

  const model = createModel(supportsNativeJsonSchema);

  // 这里保留两套 prompt：
  // - 原生 json_schema 模式下，不需要在 prompt 里反复强调 JSON 结构
  // - fallback 模式下，要把字段名明确写死，否则兼容接口可能返回自然语言
  const messages = supportsNativeJsonSchema
    ? [
        new SystemMessage('你是一个信息提取助手，请直接返回 JSON 数据。'),
        new HumanMessage('介绍一下杨振宁'),
      ]
    : [
        new SystemMessage('你是一个信息提取助手。请只返回 JSON 对象，不要输出额外解释。'),
        new HumanMessage(
          '请介绍一下杨振宁，并严格返回 JSON 对象，字段必须是 name、birth_year、field、achievements。'
        ),
      ];

  const res = await model.invoke(messages);

  console.log(chalk.green('\n✅ 收到响应:'));
  console.log(res.content);

  const parsedData = supportsNativeJsonSchema
    ? JSON.parse(extractTextContent(res))
    : parseJsonObjectFromText(extractTextContent(res));

  // 无论是否走原生 json_schema，最终都再过一遍 Zod。
  // 这样学习时能很清楚地看到：
  // - 原生结构化输出负责“约束模型”
  // - Zod 负责“最终校验”
  const normalizedData = supportsNativeJsonSchema
    ? parsedData
    : normalizeScientistRecord(parsedData);
  const data = scientistSchema.parse(normalizedData);

  console.log(chalk.cyan('\n📋 解析后的对象:'));
  console.log(data);
}

testNativeJsonSchema().catch((error) => {
  console.error(chalk.red('\n❌ structured-json-schema 运行失败:'));
  console.error(error);
  process.exit(1);
});
