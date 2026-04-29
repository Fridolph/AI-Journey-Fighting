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

// 和原始示例一样，先定义结构化输出 schema。
const schema = z.object({
    name: z.string().describe("姓名"),
    birth_year: z.number().describe("出生年份"),
    death_year: z.number().describe("去世年份"),
    nationality: z.string().describe("国籍"),
    occupation: z.string().describe("职业"),
    famous_works: z.array(z.string()).describe("著名作品列表"),
    biography: z.string().describe("简短传记")
});

// 学习版兼容说明：
// - 有些 OpenAI 兼容接口不支持 response_format: json_schema
// - 有些模型又不支持强制 tool_choice
// 所以这里延续 with-structured-output-fix 的思路：
// - DeepSeek 兼容端点 / reasoner 模型优先走 jsonMode
// - 其他情况优先尝试 functionCalling
const providerBaseUrl = process.env.OPENAI_BASE_URL?.toLowerCase() ?? "";
const modelName = process.env.MODEL_NAME?.toLowerCase() ?? "";

const selectedMethod =
    providerBaseUrl.includes("deepseek.com") || modelName.includes("reasoner")
        ? "jsonMode"
        : "functionCalling";

const structuredModel = model.withStructuredOutput(schema, {
    method: selectedMethod,
});

// jsonMode 下通常要在 prompt 里明确说明“返回 JSON”，否则兼容接口可能拒绝请求。
const prompt = selectedMethod === "jsonMode"
    ? "请详细介绍莫扎特的信息，并以 JSON 格式返回 name、birth_year、death_year、nationality、occupation、famous_works、biography 这几个字段。"
    : "详细介绍莫扎特的信息。";

console.log("🌊 流式结构化输出演示（withStructuredOutput 兼容版）\n");
console.log(`当前 method: ${selectedMethod}\n`);

try {
    const stream = await structuredModel.stream(prompt);

    let chunkCount = 0;
    let lastChunk = null;

    console.log("📡 接收流式数据:\n");

    for await (const chunk of stream) {
        chunkCount++;
        lastChunk = chunk;

        console.log(`[Chunk ${chunkCount}]`);
        console.log(JSON.stringify(chunk, null, 2));
    }

    console.log(`\n✅ 共接收 ${chunkCount} 个数据块\n`);

    if (lastChunk) {
        console.log("📊 最终结构化结果:\n");
        console.log(JSON.stringify(lastChunk, null, 2));

        console.log("\n📝 格式化输出:");
        console.log(`姓名: ${lastChunk.name}`);
        console.log(`出生年份: ${lastChunk.birth_year}`);
        console.log(`去世年份: ${lastChunk.death_year}`);
        console.log(`国籍: ${lastChunk.nationality}`);
        console.log(`职业: ${lastChunk.occupation}`);
        console.log(`著名作品: ${lastChunk.famous_works.join(', ')}`);
        console.log(`传记: ${lastChunk.biography}`);
    }
} catch (error) {
    console.error("\n❌ 错误:", error.message);
}
