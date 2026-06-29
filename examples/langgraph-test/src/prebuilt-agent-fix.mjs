import "dotenv/config";

import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgentAnnotation } from "@langchain/langgraph/prebuilt"; // ★ 黑盒：一行创建
import { tool } from "@langchain/core/tools";                     // ★ tool 从 @langchain/core/tools 导入
import { z } from "zod";

import { getProductBySku } from "./inventory-mock.mjs";

// ─── Tool 定义三要素 ──────────────────────────────────────
// tool() 把普通函数包装成 AI 可理解的"带说明书的函数"
// AI 读取 description 决定要不要调，读 schema 决定传什么参数
const getProductStock = tool(
  // ① 实际执行的函数
  async ({ sku }) => getProductBySku(sku),
  {
    // ② AI 调用时用的名字
    name: "get_product_stock",
    // ③ AI 通过 description 判断这个工具是干什么的
    description:
      "按 SKU 查商品名与库存，SKU 如 SKU-001。",
    // ④ 参数类型定义（Zod schema）
    schema: z.object({
      sku: z.string().describe("商品 SKU"),
    }),
  }
);

// ─── LLM 初始化 ────────────────────────────────────────────
const model = new ChatOpenAI({ 
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
  },
  // modelKwargs: { thinking: { type: "disabled" } },
});

// ★ createReactAgentAnnotation = 一行创建完整的 ReAct Agent
// 内部自动帮你做了：
//   new StateGraph(MessagesAnnotation)
//     .addNode("agent", agentFn)
//     .addNode("tools", new ToolNode(tools))
//     .addEdge(START, "agent")
//     .addConditionalEdges("agent", toolsCondition, ["tools", END])
//     .addEdge("tools", "agent")
//     .compile({ checkpointer })
const agent = createReactAgentAnnotation({
  llm: model,                     // ★ 参数名是 llm 不是 model
  tools: [getProductStock],
  systemPrompt:
    "你是仓库助手。问库存时必须调用 get_product_stock（模拟数据），禁止编造。",
  checkpointer: new MemorySaver(),
});

const result = await agent.invoke(
  { messages: [new HumanMessage("SKU-002 还剩多少库存？")] },
  { configurable: { thread_id: "demo-thread" } }
);

// ★ createReactAgentAnnotation 实例直接支持 getGraphAsync()，无需 .graph
const drawable = await agent.getGraphAsync();
const mermaid = drawable.drawMermaid({ withStyles: true });
console.log(mermaid);

const last = result.messages.at(-1);
console.log(last?.content ?? result);
