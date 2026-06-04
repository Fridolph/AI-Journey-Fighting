import "dotenv/config";

import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { createSupervisor } from "@langchain/langgraph-supervisor";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { z } from "zod";

import { lookupCityTrivia, lookupWeather } from "./simple-mock.mjs";

// ─── 基础模型：给子 Agent 使用 ─────────────────────────────────────
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  modelKwargs: {
    thinking: {
      type: "disabled",
    },
  },
});

// ─── Supervisor 专用模型：关闭 thinking + 关闭并行 tool calls ───────
const supervisorModel = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  modelKwargs: {
    thinking: {
      type: "disabled",
    },
    parallel_tool_calls: false,
  },
});

// ─── 最终总结模型：不参与 tool call，只负责整合文本 ─────────────────
const summaryModel = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// ─── 工具定义 ──────────────────────────────────────────────────────
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

// ─── 子 Agent A：天气 ──────────────────────────────────────────────
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
3. 如果用户问题里还包含城市小知识、历史、名胜等内容，直接忽略这些部分。
4. 不要说“我无法回答小知识”。
5. 不要解释你的职责边界。
6. 不要编造工具没有返回的信息。
7. 只输出天气数据本身，不要给出穿衣、出行、雨具等建议。
8. 中文简短回答。
`,
});

// ─── 子 Agent B：城市小知识 ────────────────────────────────────────
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
3. 如果用户问题里还包含天气、气温、空气质量等内容，直接忽略这些部分。
4. 不要说“我无法回答天气”。
5. 不要解释你的职责边界。
6. 不要编造工具没有返回的信息。
7. 直接输出小知识内容，不要说“给您查到了”。
8. 中文简短回答。
`,
});

// ─── Supervisor ───────────────────────────────────────────────────
const workflow = createSupervisor({
  agents: [weatherAgent.graph, triviaAgent.graph],
  llm: supervisorModel,
  prompt: `
你是 supervisor 调度员，只负责选择合适的 agent，不负责回答业务内容。

可用 agent：
- weather_agent：负责天气、气温、下不下雨、空气质量。
- trivia_agent：负责城市小知识、名胜、历史、一句介绍。

严格调度规则：
1. 每次只能调用一个 agent。
2. 禁止在同一轮中同时调用多个 agent。
3. 禁止并行调用 agent。
4. 如果用户同时问了天气和小知识，必须严格分两步：
   第一步：调用 weather_agent。
   第二步：等 weather_agent 完成后，再调用 trivia_agent。
5. weather_agent 和 trivia_agent 都完成后，立即结束。
6. 你自己不要报天气，不要讲城市百科，不要总结业务内容。
7. 不要重复调用已经完成的 agent。
`,
});

const app = workflow.compile();

// ─── 打印 Mermaid 图 ───────────────────────────────────────────────
const drawable = await app.getGraphAsync();
console.log(drawable.drawMermaid({ withStyles: true }));

// ─── 用户输入 ─────────────────────────────────────────────────────
const userQuestion = "查一下杭州的天气，再讲一条和杭州有关的小知识。";

const input = {
  messages: [new HumanMessage(userQuestion)],
};

// ─── 执行图 ───────────────────────────────────────────────────────
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

// ─── 输出路径 ─────────────────────────────────────────────────────
console.log("\n路径:", nodePath.join(" → "));

// ─── 提取有效回答 ─────────────────────────────────────────────────
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
    "unknown"
  );
}

const weatherMessages = [];
const triviaMessages = [];
const otherMessages = [];

for (const msg of validAIMessages) {
  const name = getMessageName(msg);

  if (name === "weather_agent") {
    weatherMessages.push(msg);
  } else if (name === "trivia_agent") {
    triviaMessages.push(msg);
  } else {
    otherMessages.push(msg);
  }
}

/**
 * 有些版本不会把 name 挂在 AIMessage 上。
 * 如果无法按 name 区分，则根据执行顺序兜底：
 * 通常第一个有效 AI 是 weather_agent，第二个有效 AI 是 trivia_agent。
 */
let weatherResult = weatherMessages.at(-1)?.content ?? null;
let triviaResult = triviaMessages.at(-1)?.content ?? null;

if (!weatherResult && !triviaResult && validAIMessages.length >= 2) {
  weatherResult = validAIMessages[0].content;
  triviaResult = validAIMessages[1].content;
} else if (!weatherResult && validAIMessages.length >= 1) {
  weatherResult = validAIMessages[0].content;
} else if (!triviaResult && validAIMessages.length >= 2) {
  triviaResult = validAIMessages[1].content;
}

// ─── 过程输出 ─────────────────────────────────────────────────────
console.log("\n─── 过程输出 ───");

if (weatherResult) {
  console.log("\n[weather_agent]");
  console.log(weatherResult);
}

if (triviaResult) {
  console.log("\n[trivia_agent]");
  console.log(triviaResult);
}

if (!weatherResult && !triviaResult) {
  console.log("没有提取到 agent 输出。");
}

// ─── 独立总结：把两个 agent 的结果融合成最终回答 ───────────────────
const summaryPrompt = `
你是最终回答整合员。

用户原始问题：
${userQuestion}

weather_agent 的结果：
${weatherResult ?? "暂无天气结果"}

trivia_agent 的结果：
${triviaResult ?? "暂无城市小知识结果"}

请把 weather_agent 和 trivia_agent 的结果整合成一段自然、流畅、有温度的中文回答。

要求：
1. 不要机械拼接。
2. 不要出现“weather_agent”“trivia_agent”这些字样。
3. 不要出现“根据 weather_agent 的结果”这种表达。
4. 不要分成两个割裂的段落。
5. 不要编造任何没有提供的信息。
6. 如果某个结果里包含“我无法回答某类问题”这类职责边界解释，请忽略这类解释。
7. 直接给用户最终答案。
`;

const summaryResponse = await summaryModel.invoke([
  new HumanMessage(summaryPrompt),
]);

const finalAnswer =
  typeof summaryResponse.content === "string"
    ? summaryResponse.content
    : JSON.stringify(summaryResponse.content);

// ─── 最终输出 ─────────────────────────────────────────────────────
console.log("\n─── 最终回答 ───");
console.log(finalAnswer);
