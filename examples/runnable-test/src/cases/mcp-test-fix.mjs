import 'dotenv/config';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { ChatOpenAI } from '@langchain/openai';
import chalk from 'chalk';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableSequence, RunnableLambda, RunnableBranch, RunnablePassthrough } from '@langchain/core/runnables';

/**
 * 修复：deepseek-v4-flash 永远处于 thinking mode，AssistantMessage 回传时
 *      LangChain ChatOpenAI 序列化不会把 reasoning_content 放入请求体。
 *      deepseek-chat 无 thinking mode，不需要 reasoning_content 回传。
 */
const model = new ChatOpenAI({
  modelName: 'deepseek-chat',
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    "amap-maps-streamableHTTP": {
      "url": "https://mcp.amap.com/mcp?key=" + process.env.AMAP_MAPS_API_KEY
    },
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    },
  }
});

const tools = await mcpClient.getTools();
const modelWithTools = model.bindTools(tools);

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "你是一个可以调用 MCP 工具的智能助手。"],
  new MessagesPlaceholder("messages"),
]);

const llmChain = prompt.pipe(modelWithTools);

const toolExecutor = new RunnableLambda({
  func: async (input) => {
    const { response, tools } = input;
    const toolResults = [];
    for (const toolCall of response.tool_calls ?? []) {
      const foundTool = tools.find(t => t.name === toolCall.name);
      if (!foundTool) continue;
      const toolResult = await foundTool.invoke(toolCall.args);
      const contentStr = typeof toolResult === 'string'
        ? toolResult
        : (toolResult?.text || JSON.stringify(toolResult));
      toolResults.push(new ToolMessage({
        content: contentStr,
        tool_call_id: toolCall.id,
      }));
    }
    return toolResults;
  }
});

const agentStepChain = RunnableSequence.from([
  RunnablePassthrough.assign({ response: llmChain }),
  RunnableBranch.from([
    [
      (state) => !state.response?.tool_calls || state.response.tool_calls.length === 0,
      new RunnableLambda({
        func: async (state) => {
          const { messages, response } = state;
          const newMessages = [...messages, response];
          return { ...state, messages: newMessages, done: true, final: response.content };
        },
      }),
    ],
    RunnableSequence.from([
      new RunnableLambda({
        func: async (state) => {
          const { messages, response } = state;
          const newMessages = [...messages, response];
          console.log(chalk.bgBlue(`🔍 检测到 ${response.tool_calls.length} 个工具调用`));
          console.log(chalk.bgBlue(`🔍 工具调用: ${response.tool_calls.map((t) => t.name).join(', ')}`));
          return { ...state, messages: newMessages };
        },
      }),
      RunnablePassthrough.assign({ toolMessages: toolExecutor }),
      new RunnableLambda({
        func: async (state) => {
          const { messages, toolMessages } = state;
          return { ...state, messages: [...messages, ...(toolMessages ?? [])], done: false };
        },
      }),
    ]),
  ]),
]);

async function runAgentWithTools(query, maxIterations = 30) {
  let state = {
    messages: [new HumanMessage(query)],
    done: false,
    final: null,
    tools,
  };
  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`⏳ 正在等待 AI 思考...`));
    state = await agentStepChain.invoke(state);
    if (state.done) {
      console.log(`\n✨ AI 最终回复:\n${state.final}\n`);
      return state.final;
    }
  }
  return state.messages[state.messages.length - 1].content;
}

await runAgentWithTools("成都天府五街附近的酒店，最近的 3 个酒店，拿到酒店图片，打开浏览器，展示每个酒店的图片，每个 tab 一个 url 展示，并且在把那个页面标题改为酒店名");
