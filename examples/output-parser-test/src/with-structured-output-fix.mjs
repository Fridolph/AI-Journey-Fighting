import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

const model = new ChatOpenAI({
    modelName: process.env.MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 定义结构化输出的 schema
const scientistSchema = z.object({
    name: z.string().describe("科学家的全名"),
    birth_year: z.number().describe("出生年份"),
    nationality: z.string().describe("国籍"),
    fields: z.array(z.string()).describe("研究领域列表"),
});

// 注意：
// withStructuredOutput 虽然很好用，但不同“OpenAI 兼容模型”对结构化输出支持程度不同。
//
// 我们这次真实遇到的兼容性差异有两类：
// 1. 有些模型 / 供应商不支持 response_format: { type: "json_schema" }
//    会报：This response_format type is unavailable now
// 2. 有些 reasoning 模型又不支持强制 tool_choice
//    会报：does not support this tool_choice
//
// 所以这里做一个学习版兼容策略：
// - 普通聊天模型：优先走 functionCalling（tool call）
// - reasoner 类模型：退回 jsonMode，并在 prompt 里明确要求返回 JSON
const providerBaseUrl = process.env.OPENAI_BASE_URL?.toLowerCase() ?? "";
const modelName = process.env.MODEL_NAME?.toLowerCase() ?? "";

// 实战里不要只迷信 modelName。
// 这次真实排查就遇到：MODEL_NAME 看起来是普通聊天模型，
// 但服务端实际仍返回了 “does not support this tool_choice”。
//
// 所以这里把“供应商兼容性”也纳入判断：
// - DeepSeek 兼容端点：优先走 jsonMode
// - 显式包含 reasoner：优先走 jsonMode
// - 其他情况：先尝试 functionCalling
const selectedMethod =
    providerBaseUrl.includes("deepseek.com") || modelName.includes("reasoner")
        ? "jsonMode"
        : "functionCalling";

const structuredModel = model.withStructuredOutput(scientistSchema, {
    method: selectedMethod,
});

const question = selectedMethod === "jsonMode"
    ? "请介绍一下爱因斯坦，并以 JSON 格式返回 name、birth_year、nationality、fields 这几个字段。"
    : "介绍一下爱因斯坦";

// 调用模型
const result = await structuredModel.invoke(question);
console.log('🚀 --------------- result:\n', result)

// {
//   name: 'Albert Einstein',
//   birth_year: 1879,
//   nationality: 'Swiss, German, American',
//   fields: [ 'Theoretical physics', 'Quantum mechanics', 'Relativity' ]
// }

console.log("\n--------------结构化结果: \n", JSON.stringify(result, null, 2));
// {
//   "name": "阿尔伯特·爱因斯坦",
//   "birth_year": 1879,
//   "nationality": "德国/瑞士/美国",
//   "fields": [
//     "物理学",
//     "数学"
//   ]
// }
console.log(`\n姓名: ${result.name}`);
console.log(`出生年份: ${result.birth_year}`);
console.log(`国籍: ${result.nationality}`);
console.log(`研究领域: ${result.fields.join(', ')}`);
