import "dotenv/config";

import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { createSupervisor } from "@langchain/langgraph-supervisor";
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

/** Supervisor 专用模型：禁止并行 tool calls */
const supervisorModel = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  modelKwargs: {
    thinking: { type: "disabled" },
    parallel_tool_calls: false,
  },
});

/** 最终整合模型：不参与 tool call，只负责整合文本 */
const summaryModel = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  modelKwargs: { thinking: { type: "disabled" } },
});

// ═══════════════════════════════════════════════════════════════════
// 工具定义（weather / trivia，iching 不需要工具）
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
 * Agent 3：易经选卦（纯推理，不需要任何工具）
 */
const ichingAgent = createAgent({
  name: "iching_agent",
  description:
    "根据城市和当前天气，从易经六十四卦中选出最契合的一卦及爻辞。必须在 weather_agent 完成后才能调用。",
  model,
  tools: [],
  systemPrompt: `
你是 iching_agent，精通易经六十四卦。

你的任务：
从对话历史中找到 weather_agent 提供的城市名和天气状况，
根据天气意境，从易经六十四卦中选出最契合的一卦，给出原文爻辞和含义。

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
   - 等待时机 → 需卦
2. 爻辞必须是易经原文，不要自行创作。
3. 含义要结合城市和天气，有意境，一句话即可。
4. 不要加任何客套话或前缀，直接输出格式内容。
`,
});

// ═══════════════════════════════════════════════════════════════════
// Supervisor
// ═══════════════════════════════════════════════════════════════════

const workflow = createSupervisor({
  agents: [weatherAgent.graph, triviaAgent.graph, ichingAgent.graph],
  llm: supervisorModel,
  prompt: `
你是 supervisor 调度员，只负责按顺序调度 agent，不负责回答任何业务内容。

可用 agent：
- weather_agent：查询天气、气温、空气质量。
- trivia_agent：查询城市小知识、名胜、历史。
- iching_agent：根据城市和天气选卦，必须在 weather_agent 完成后才能调用。

严格串行调度顺序（不可更改）：
第一步：调用 weather_agent。
第二步：weather_agent 完成后，调用 trivia_agent。
第三步：trivia_agent 完成后，调用 iching_agent。
第四步：iching_agent 完成后，立即结束，不再调用任何 agent。

铁律：
- 每次只能调用一个 agent。
- 禁止并行调用多个 agent。
- 禁止跳过任何步骤。
- 禁止重复调用已完成的 agent。
- 你自己不要输出任何天气、小知识、卦象等业务内容。
`,
});

const app = workflow.compile();

// ═══════════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════════

/**
 * 从 finalState 中提取三个 agent 的最后一条有效输出。
 * 兼容 msg.name 字段不存在的情况（按执行顺序兜底）。
 */
function extractAgentResults(finalState) {
  const messages = finalState?.messages ?? [];

  const validAIMessages = messages.filter((msg) => {
    const isAI = msg?.getType?.() === "ai" || msg instanceof AIMessage;
    const hasContent =
      typeof msg.content === "string" && msg.content.trim().length > 0;
    const hasNoToolCalls =
      !Array.isArray(msg.tool_calls) || msg.tool_calls.length === 0;
    return isAI && hasContent && hasNoToolCalls;
  });

  function getMessageName(msg) {
    return (
      msg.name ??
      msg.additional_kwargs?.name ??
      msg.response_metadata?.name ??
      null
    );
  }

  const buckets = {
    weather_agent: [],
    trivia_agent: [],
    iching_agent: [],
  };

  for (const msg of validAIMessages) {
    const name = getMessageName(msg);
    if (name && buckets[name]) {
      buckets[name].push(msg);
    }
  }

  let weatherResult = buckets.weather_agent.at(-1)?.content ?? null;
  let triviaResult = buckets.trivia_agent.at(-1)?.content ?? null;
  let ichingResult = buckets.iching_agent.at(-1)?.content ?? null;

  // 兜底：name 字段不存在时，按执行顺序取前三条
  if (!weatherResult && !triviaResult && !ichingResult) {
    weatherResult = validAIMessages[0]?.content ?? null;
    triviaResult = validAIMessages[1]?.content ?? null;
    ichingResult = validAIMessages[2]?.content ?? null;
  }

  return { weatherResult, triviaResult, ichingResult };
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
7. 语气自然，像朋友聊天一样，篇幅控制在100字以内，重点突出，条理清晰。
8. 直接给用户最终答案，不要加任何前缀。
`;

  const response = await summaryModel.invoke([new HumanMessage(prompt)]);

  return typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);
}

// ═══════════════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════════════

// 打印 Mermaid 图
const drawable = await app.getGraphAsync();
console.log(drawable.drawMermaid({ withStyles: true }));

// 用户输入
const userQuestion = "查一下杭州的天气，再讲一条和杭州有关的小知识。";
const input = { messages: [new HumanMessage(userQuestion)] };

console.log("📍 执行模式：全串行 Supervisor");
console.log("─".repeat(50));
console.log("weather_agent → trivia_agent → iching_agent（依次串行）");
console.log("");

// ─── 执行图（计时整个 supervisor 流程）────────────────────────────
console.log("⏳ Supervisor 串行调度中...");
const supervisorStart = Date.now();

const nodePath = [];
let finalState = null;

const stream = await app.stream(input, {
  streamMode: ["updates", "values"],
});

for await (const event of stream) {
  const [mode, payload] = event;

  if (mode === "updates" && payload && typeof payload === "object") {
    nodePath.push(...Object.keys(payload));
  }

  if (mode === "values") {
    finalState = payload;
  }
}

const supervisorDuration = Date.now() - supervisorStart;
console.log(`✅ Supervisor 完成，耗时 ${supervisorDuration}ms`);

// ─── 提取结果 ─────────────────────────────────────────────────────
const { weatherResult, triviaResult, ichingResult } =
  extractAgentResults(finalState);

// ─── 整合最终回答（计时）─────────────────────────────────────────
console.log("\n⏳ 整合最终回答...");
const summaryStart = Date.now();

const finalAnswer = await summarizeResults({
  userQuestion,
  weatherResult,
  triviaResult,
  ichingResult,
});

const summaryDuration = Date.now() - summaryStart;
console.log(`✅ 整合完成，耗时 ${summaryDuration}ms`);

// ─── 格式化输出 ────────────────────────────────────────────────────
console.log("\n📍 执行路径");
console.log("─".repeat(50));
console.log(nodePath.join(" → "));

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

// ─── 耗时统计 ─────────────────────────────────────────────────────
const totalDuration = supervisorDuration + summaryDuration;

console.log("\n⏱️  耗时统计（串行 Supervisor 版）");
console.log("─".repeat(50));
console.log(`  Supervisor 串行调度                ：${supervisorDuration}ms`);
console.log(`    └─ weather_agent（含 supervisor 调度开销）`);
console.log(`    └─ trivia_agent （含 supervisor 调度开销）`);
console.log(`    └─ iching_agent （含 supervisor 调度开销）`);
console.log(`  整合（summary）                    ：${summaryDuration}ms`);
console.log("─".repeat(50));
console.log(`  总计                               ：${totalDuration}ms`);
console.log("");
console.log("  💡 对比参考：");
console.log("     串行版：weather + trivia + iching 依次执行，耗时叠加");
console.log("     并行版：weather 和 trivia 同时执行，理论节省 ~1 个 LLM 调用时间");

// > node src/multi-agent-pro-1.mjs

// %%{init: {'flowchart': {'curve': 'linear'}}}%%
// graph TD;
//         __start__([<p>__start__</p>]):::first
//         supervisor(supervisor)
//         weather_agent(weather_agent)
//         trivia_agent(trivia_agent)
//         iching_agent(iching_agent)
//         __start__ --> supervisor;
//         iching_agent --> supervisor;
//         trivia_agent --> supervisor;
//         weather_agent --> supervisor;
//         supervisor -.-> weather_agent;
//         supervisor -.-> trivia_agent;
//         supervisor -.-> iching_agent;
//         classDef default fill:#f2f0ff,line-height:1.2;
//         classDef first fill-opacity:0;
//         classDef last fill:#bfb6fc;

// 📍 执行模式：全串行 Supervisor
// ──────────────────────────────────────────────────
// weather_agent → trivia_agent → iching_agent（依次串行）

// ⏳ Supervisor 串行调度中...
// ✅ Supervisor 完成，耗时 9535ms

// ⏳ 整合最终回答...
// ✅ 整合完成，耗时 1287ms

// 📍 执行路径
// ──────────────────────────────────────────────────
// supervisor → weather_agent → supervisor → trivia_agent → supervisor → iching_agent → supervisor

// 🧩 Agent 过程
// ──────────────────────────────────────────────────

//   1. [weather_agent]
//      杭州今天多云转小雨，气温 15～22°C，空气质量良。

// 至于杭州小知识、历史、名胜等内容，超出了我的回答范围，我只负责提供天气信息哦。

//   2. [trivia_agent]
//      西湖文化景观是世界文化遗产之一。

//   3. [iching_agent]
//      卦象：小畜卦（䷈）  
//      爻辞：密云不雨，自我西郊  
//      含义：杭州今天多云转小雨，正是"密云不雨"之气，雨意已蓄，云自西来，宜静观其变。

// ✅ 最终回答
// ──────────────────────────────────────────────────
// 杭州今天多云转小雨，15~22°C，空气质量良。这倒应了《易经》中小畜卦的“密云不雨”，雨意已蓄，宜静观其变。西湖文化景观是世界文化遗产，雨天漫步更添江南韵味。

// ⏱️  耗时统计（串行 Supervisor 版）
// ──────────────────────────────────────────────────
//   Supervisor 串行调度                ：9535ms
//     └─ weather_agent（含 supervisor 调度开销）
//     └─ trivia_agent （含 supervisor 调度开销）
//     └─ iching_agent （含 supervisor 调度开销）
//   整合（summary）                    ：1287ms
// ──────────────────────────────────────────────────
//   总计                               ：10822ms

//   💡 对比参考：
//      串行版：weather + trivia + iching 依次执行，耗时叠加
//      并行版：weather 和 trivia 同时执行，理论节省 ~1 个 LLM 调用时间