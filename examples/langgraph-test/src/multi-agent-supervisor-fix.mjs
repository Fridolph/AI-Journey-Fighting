/**
 * multi-agent-supervisor-fix.mjs
 *
 * 修复版 — 基于 @langchain/langgraph-supervisor 的简化版
 *
 * 修复内容：
 *   ① createAgent ("langchain" 旧 API) → createReactAgent ("@langchain/langgraph/prebuilt")
 *   ② deepseek-v4-flash（thinking 模型）→ deepseek-chat（避免 reasoning_content 兼容问题）
 *   ③ addHandoffBackMessages: false（避免 handoff 消息干扰 tool_call 配对）
 *   ④ 末尾未定义变量 → 正确过滤 AI 回复消息
 *
 * 限制说明：
 *   当前 @langchain/langgraph-supervisor v1.0.4 + deepseek-chat 在需要
 *   顺序调用多个子 Agent 时存在工具调用消息配对兼容问题。
 *   单次路由（只路由到 weather_agent 或只到 trivia_agent）正常工作。
 *
 *   如果业务需要支持"查天气 + 查知识"这种多任务查询，
 *   建议将多个工具合并到一个 Agent 中（见 complex-agent 示例）。
 */

import "dotenv/config";

import { HumanMessage } from "@langchain/core/messages";
import { createSupervisor } from "@langchain/langgraph-supervisor";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { lookupCityTrivia, lookupWeather } from "./simple-mock.mjs";

// ★ 使用 MODEL_NAME（deepseek-v4-flash），通过 modelKwargs 关闭思考模式
//   createReactAgent 默认不支持 reasoning_content 回传
//   modelKwargs: { thinking: { type: "disabled" } } 关掉思考模式即可兼容
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  modelKwargs: { thinking: { type: "disabled" } },
});

const lookupWeatherTool = tool(
  async ({ city }) => lookupWeather(city),
  {
    name: "lookup_weather",
    description: "查询某城市当日天气概况",
    schema: z.object({
      city: z.string().describe("城市名，如 成都"),
    }),
  }
);

const lookupCityTriviaTool = tool(
  async ({ city }) => lookupCityTrivia(city),
  {
    name: "lookup_city_trivia",
    description: "查询与某城市相关的一句趣味知识",
    schema: z.object({
      city: z.string().describe("城市名，如 成都"),
    }),
  }
);

// ★ 子 Agent 必须用 createReactAgent（新版 API）
const weatherAgent = createReactAgent({
  name: "weather_agent",
  llm: model,
  tools: [lookupWeatherTool],
  systemPrompt:
    "你只处理天气。用户提到城市时，用 lookup_weather 查询后再用中文简短说明。",
});

const triviaAgent = createReactAgent({
  name: "trivia_agent",
  llm: model,
  tools: [lookupCityTriviaTool],
  systemPrompt:
    "你只讲城市小知识。先 lookup_city_trivia，再用人话转述。",
});

// ★ addHandoffBackMessages: false — 防止 handoff 回执干扰 tool_call 配对
// ★ outputMode: "full_history" — 让子 Agent 看到完整消息历史（含原始用户问题）
const workflow = createSupervisor({
  agents: [weatherAgent, triviaAgent],
  llm: model,
  prompt: `你是调度员，只负责选人，不要自己回答问题。

- 问天气、气温、下不下雨、空气 → 用 weather_agent
- 问小知识、名胜、历史、一句介绍 → 用 trivia_agent
- 用户同时问多个问题 → 只回答第一个问题
`,
  outputMode: "last_message",
  addHandoffBackMessages: false,
});

const app = workflow.compile();

const drawable = await app.getGraphAsync();
console.log(drawable.drawMermaid({ withStyles: true }));

// ─── 流式执行 + 步骤化输出 ────────────────────────────────
// 用 stream() + values 模式：每次输出完整状态快照，
// 子 Agent 内部的 tool_call/ToolMessage 也能展示
const QUERY = "成都今天天气怎么样？";
console.log(`\n👤 用户：${QUERY}\n`);

const stream = await app.stream(
  { messages: [new HumanMessage(QUERY)] },
  { streamMode: "values" }
);

let prevMsgCount = 0;
let lastAnswer = "";

for await (const event of stream) {
  const state = event;
  const msgs = state?.messages ?? [];

  // 只处理新增的消息（增量输出）
  for (let i = prevMsgCount; i < msgs.length; i++) {
    const m = msgs[i];

    if (m.tool_calls?.length) {
      const calls = m.tool_calls
        .map((t) => `${t.name}(${JSON.stringify(t.args)})`)
        .join(", ");
      console.log(`  🔧 调用: ${calls}`);
    } else if (m._getType?.() === "tool") {
      const content = String(m.content ?? "").slice(0, 150);
      console.log(`  📦 工具返回: ${content}`);
    } else if (m._getType?.() === "human") {
      // 用户消息已预先打印，跳过
    } else if (m._getType?.() === "ai" && m.content) {
      const content = String(m.content);
      const preview = content.length > 120 ? content.slice(0, 120) + "..." : content;
      console.log(`  💬 回答: ${preview}`);
      lastAnswer = content;
    }
  }
  prevMsgCount = msgs.length;
}

console.log(`\n✅ 最终回答：\n${lastAnswer}`);
