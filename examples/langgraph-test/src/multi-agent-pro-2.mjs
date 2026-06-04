import "dotenv/config";

import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { z } from "zod";

import { lookupCityTrivia, lookupWeather } from "./simple-mock.mjs";

// ═══════════════════════════════════════════════════════════════════
// 模型配置
// ═══════════════════════════════════════════════════════════════════

/** 子 Agent 通用模型 */
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  modelKwargs: { thinking: { type: "disabled" } },
});

/** 最终整合模型 */
const summaryModel = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  modelKwargs: { thinking: { type: "disabled" } },
});

// ═══════════════════════════════════════════════════════════════════
// 工具定义
// ═══════════════════════════════════════════════════════════════════

const lookupWeatherTool = tool(
  async ({ city }) => {
    const result = lookupWeather(city);
    return result ?? `暂无 ${city} 的天气数据。`;
  },
  {
    name: "lookup_weather",
    description: "查询某城市当日天气概况（气温区间、天气、空气质量等）。",
    schema: z.object({
      city: z.string().describe("城市名，如 杭州"),
    }),
  }
);

const lookupCityTriviaTool = tool(
  async ({ city }) => {
    const result = lookupCityTrivia(city);
    return result ?? `暂无 ${city} 的城市小知识数据。`;
  },
  {
    name: "lookup_city_trivia",
    description: "查询与某城市相关的一句趣味知识。",
    schema: z.object({
      city: z.string().describe("城市名，如 杭州"),
    }),
  }
);

// ═══════════════════════════════════════════════════════════════════
// 子 Agent 定义
// ═══════════════════════════════════════════════════════════════════

/** Agent 1：天气（需要工具） */
const weatherAgent = createAgent({
  name: "weather_agent",
  description: "专门查天气、气温、下不下雨、空气质量。",
  model,
  tools: [lookupWeatherTool],
  systemPrompt: `
你是 weather_agent，只负责天气相关问题。

规则：
1. 必须调用 lookup_weather 查询天气。
2. 只基于 lookup_weather 的返回内容回答。
3. 忽略用户问题里的城市小知识、历史、名胜、易经等内容。
4. 不要解释你的职责边界，不要说"我无法回答xxx"。
5. 不要编造工具没有返回的信息。
6. 只输出天气数据本身（天气状况、气温、空气质量），不要给出穿衣、出行建议。
7. 中文简短回答，一句话即可。
`,
});

/** Agent 2：城市小知识（需要工具） */
const triviaAgent = createAgent({
  name: "trivia_agent",
  description: "专门讲与城市相关的小知识、名胜、历史、一句介绍。",
  model,
  tools: [lookupCityTriviaTool],
  systemPrompt: `
你是 trivia_agent，只负责城市小知识相关问题。

规则：
1. 必须调用 lookup_city_trivia 查询城市小知识。
2. 只基于 lookup_city_trivia 的返回内容回答。
3. 忽略用户问题里的天气、气温、空气质量、易经等内容。
4. 不要解释你的职责边界，不要说"我无法回答xxx"。
5. 不要编造工具没有返回的信息。
6. 直接输出小知识内容，不要加"给您查到了"等客套话。
7. 中文简短回答，一句话即可。
`,
});

/**
 * Agent 3：易经选卦（纯推理，无工具）
 * 依赖 weather_agent 的结果，必须在其完成后调用。
 */
const ichingAgent = createAgent({
  name: "iching_agent",
  description:
    "根据城市和当前天气，从易经六十四卦中选出最契合的一卦及爻辞。",
  model,
  tools: [],
  systemPrompt: `
你是 iching_agent，精通易经六十四卦。

你的任务：
根据传入的城市名和天气状况，从易经六十四卦中选出最契合的一卦，给出原文爻辞和含义。

严格按以下格式输出，不要加任何多余内容：
卦象：xxx卦（卦符）
爻辞：xxx（原文，不要改写）
含义：xxx（一句话，结合当前天气和城市解释）

选卦原则：
1. 优先选与天气意象直接相关的卦，例如：
   - 雨未降、云积聚 → 小畜卦"密云不雨"
   - 雷雨大作 → 解卦、震卦
   - 晴空万里 → 乾卦
   - 云雾迷蒙 → 蒙卦
   - 等待时机、阴晴不定 → 需卦
2. 爻辞必须是易经原文，不要自行创作。
3. 含义结合城市和天气，有意境，一句话即可。
4. 不要加任何客套话或前缀，直接输出格式内容。
`,
});

// ═══════════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════════

/**
 * 从 agent.invoke() 返回的结果中提取最后一条有效 AI 消息内容。
 */
function extractLastContent(agentResult) {
  const messages = agentResult?.messages ?? [];

  const validMessages = messages.filter((msg) => {
    const isAI = msg?.getType?.() === "ai" || msg instanceof AIMessage;
    const hasContent =
      typeof msg.content === "string" && msg.content.trim().length > 0;
    const hasNoToolCalls =
      !Array.isArray(msg.tool_calls) || msg.tool_calls.length === 0;
    return isAI && hasContent && hasNoToolCalls;
  });

  return validMessages.at(-1)?.content ?? null;
}

/**
 * 独立调用 summaryModel，把三个 agent 的结果整合成最终回答。
 */
async function summarizeResults({
  userQuestion,
  weatherResult,
  triviaResult,
  ichingResult,
}) {
  const prompt = `
你是最终回答整合员。

用户原始问题：
${userQuestion}

天气信息：
${weatherResult ?? "暂无天气数据"}

城市小知识：
${triviaResult ?? "暂无城市小知识数据"}

易经卦象：
${ichingResult ?? "暂无易经卦象数据"}

请把以上三部分内容整合成一段自然、流畅、有温度的中文回答。

要求：
1. 不要机械拼接，融合成一段连贯的叙述。
2. 不要出现"weather_agent""trivia_agent""iching_agent"等字样。
3. 不要出现"根据xxx的结果"这种表达。
4. 天气、城市小知识、易经卦象三者要有机结合，不要割裂成三段。
5. 易经部分自然融入，可以用"《易经》有云"或直接引用爻辞。
6. 不要编造任何没有提供的信息。
7. 语气自然，像朋友聊天一样，篇幅控制在 100 字以内，简洁有力。
8. 直接给用户最终答案，不要加任何前缀。
`;

  const response = await summaryModel.invoke([new HumanMessage(prompt)]);

  return typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);
}

// ═══════════════════════════════════════════════════════════════════
// 主流程：混合并行 + 串行调度
// ═══════════════════════════════════════════════════════════════════

const userQuestion = "查一下杭州的天气，再讲一条和杭州有关的小知识。";
const input = { messages: [new HumanMessage(userQuestion)] };

console.log("📍 执行路径");
console.log("─".repeat(50));
console.log("weather_agent ──┐");
console.log("                ├─ [并行] ──→ iching_agent ──→ summarizeResults");
console.log("trivia_agent  ──┘");
console.log("");

// ─── Step 1：并行执行 weather_agent 和 trivia_agent ───────────────
console.log("⏳ Step 1：并行查询天气 + 城市小知识...");
const parallelStart = Date.now();

const [weatherRes, triviaRes] = await Promise.all([
  weatherAgent.invoke(input),
  triviaAgent.invoke(input),
]);

const parallelDuration = Date.now() - parallelStart;
console.log(`✅ Step 1 完成，耗时 ${parallelDuration}ms`);

const weatherResult = extractLastContent(weatherRes);
const triviaResult = extractLastContent(triviaRes);

// ─── Step 2：串行执行 iching_agent（依赖天气结果）────────────────
console.log("\n⏳ Step 2：根据天气查询易经卦象...");
const ichingStart = Date.now();

// 把天气结果注入到 iching_agent 的输入中，确保它能读到
const ichingInput = {
  messages: [
    new HumanMessage(
      `城市：杭州\n当前天气：${weatherResult ?? "未知"}\n\n请根据以上信息选出最契合的易经卦象。`
    ),
  ],
};

const ichingRes = await ichingAgent.invoke(ichingInput);
const ichingDuration = Date.now() - ichingStart;
console.log(`✅ Step 2 完成，耗时 ${ichingDuration}ms`);

const ichingResult = extractLastContent(ichingRes);

// ─── Step 3：整合最终回答 ─────────────────────────────────────────
console.log("\n⏳ Step 3：整合最终回答...");
const summaryStart = Date.now();

const finalAnswer = await summarizeResults({
  userQuestion,
  weatherResult,
  triviaResult,
  ichingResult,
});

const summaryDuration = Date.now() - summaryStart;
console.log(`✅ Step 3 完成，耗时 ${summaryDuration}ms`);

// ─── 格式化输出 ────────────────────────────────────────────────────
console.log("\n🧩 Agent 过程");
console.log("─".repeat(50));

if (weatherResult) {
  console.log(`\n  1. [weather_agent]\n     ${weatherResult}`);
}

if (triviaResult) {
  console.log(`\n  2. [trivia_agent]\n     ${triviaResult}`);
}

if (ichingResult) {
  console.log(
    `\n  3. [iching_agent]\n     ${ichingResult.replace(/\n/g, "\n     ")}`
  );
}

console.log("\n✅ 最终回答");
console.log("─".repeat(50));
console.log(finalAnswer);

console.log("\n⏱️  耗时统计");
console.log("─".repeat(50));
console.log(`  Step 1 并行（weather + trivia）：${parallelDuration}ms`);
console.log(`  Step 2 串行（iching）          ：${ichingDuration}ms`);
console.log(`  Step 3 整合（summary）         ：${summaryDuration}ms`);
console.log(`  总计                           ：${parallelDuration + ichingDuration + summaryDuration}ms`);

// > node src/multi-agent-pro-2.mjs

// 📍 执行路径
// ──────────────────────────────────────────────────
// weather_agent ──┐
//                 ├─ [并行] ──→ iching_agent ──→ summarizeResults
// trivia_agent  ──┘

// ⏳ Step 1：并行查询天气 + 城市小知识...
// ✅ Step 1 完成，耗时 1801ms

// ⏳ Step 2：根据天气查询易经卦象...
// ✅ Step 2 完成，耗时 1135ms

// ⏳ Step 3：整合最终回答...
// ✅ Step 3 完成，耗时 1279ms

// 🧩 Agent 过程
// ──────────────────────────────────────────────────

//   1. [weather_agent]
//      杭州今天多云转小雨，气温15~22°C，空气质量良。

//   2. [trivia_agent]
//      西湖文化景观是世界文化遗产之一。

//   3. [iching_agent]
//      卦象：需卦（䷄）
//      爻辞：需于郊，利用恒，无咎。
//      含义：杭州今日云起雨渐，如待时而动，需卦喻耐心守候，小雨润城，正宜从容。

// ✅ 最终回答
// ──────────────────────────────────────────────────
// 杭州今天多云转小雨，气温15~22°C，空气质量良。《易经》需卦有云“需于郊，利用恒”，正合此情——小雨润城，宜从容信步。顺便一提，西湖文化景观可是世界文化遗产，雨中泛舟更有别样韵味。

// ⏱️  耗时统计
// ──────────────────────────────────────────────────
//   Step 1 并行（weather + trivia）：1801ms
//   Step 2 串行（iching）          ：1135ms
//   Step 3 整合（summary）         ：1279ms
//   总计                           ：4215ms