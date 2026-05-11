import 'dotenv/config';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { ChatOpenAI } from '@langchain/openai';
import chalk from 'chalk';
import { HumanMessage, ToolMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableSequence, RunnableLambda, RunnableBranch, RunnablePassthrough } from '@langchain/core/runnables';

const model = new ChatOpenAI({ 
    modelName: process.env.MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY,
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
            "args": [
                "-y",
                "chrome-devtools-mcp@latest"
            ]
        },
    }
});
// 从所有 MCP Server 拉取可用工具列表
const tools = await mcpClient.getTools();
// 把工具描述注入到 LLM，让它知道"我能调用哪些工具"
const modelWithTools = model.bindTools(tools);

const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个可以调用 MCP 工具的智能助手。"],
    // 关键: 每轮循环都把完整的对话历史（包括上一轮的 ToolMessage）
    // 传进去，LLM 才能"记住"上下文
    new MessagesPlaceholder("messages"),
]);

const llmChain = prompt.pipe(modelWithTools);

// 1. 定义处理工具调用的逻辑 (封装为 Runnable)
const toolExecutor = new RunnableLambda({
    func: async (input) => {
        const { response, tools } = input;
        const toolResults = [];

        for (const toolCall of response.tool_calls ?? []) {
            // 1. 从工具列表里找到对应工具
            const foundTool = tools.find(t => t.name === toolCall.name);
            if (!foundTool) continue;
            // 2. 执行工具，传入 LLM 决定的参数
            const toolResult = await foundTool.invoke(toolCall.args);

            // 3. 统一格式化为字符串
            const contentStr = typeof toolResult === 'string'
                ? toolResult
                : (toolResult?.text || JSON.stringify(toolResult));

            // 4. 包装成 ToolMessage（LangChain 标准格式
            toolResults.push(new ToolMessage({
                content: contentStr,
                tool_call_id: toolCall.id,
            }));
        }

        return toolResults;
    }
});

// 2. 对结果的处理 - 单轮 Agent 步骤
const agentStepChain = RunnableSequence.from([
    // step1: 将 LLM 输出挂到 state.response 上
    // 该方法用途：保留原有字段，追加新字段，不破坏 state 结构。
    RunnablePassthrough.assign({
        response: llmChain,
    }),
    // step2: 使用 RunnableBranch 根据是否有 tool_calls 走不同分支
    RunnableBranch.from([
        // 分支1：没有 tool_calls，认为本轮已经完成
        [
            (state) =>
                !state.response?.tool_calls ||
                state.response.tool_calls.length === 0,
            new RunnableLambda({
                func: async (state) => {
                    const { messages, response } = state;
                    // 把 AI 回复写入历史信息
                    const newMessages = [...messages, response];
                    return {
                        ...state,
                        messages: newMessages,
                        done: true,
                        final: response.content,
                    };
                },
            }),
        ],
        // 默认分支：有 tool_calls，调用工具并把 ToolMessage 写回 messages
        RunnableSequence.from([
            new RunnableLambda({
                func: async (state) => {
                    const { messages, response } = state;
                    const newMessages = [...messages, response];

                    console.log(
                        chalk.bgBlue(
                            `🔍 检测到 ${response.tool_calls.length} 个工具调用`
                        )
                    );
                    console.log(
                        chalk.bgBlue(
                            `🔍 工具调用: ${response.tool_calls
                                .map((t) => t.name)
                                .join(', ')}`
                        )
                    );

                    return {
                        ...state,
                        // AIMessage 先写入历史
                        messages: newMessages,
                    };
                },
            }),
            // 调用工具执行器，得到 toolMessages
            RunnablePassthrough.assign({
                toolMessages: toolExecutor,
            }),
            new RunnableLambda({
                func: async (state) => {
                    const { messages, toolMessages } = state;
                    return {
                        ...state,
                        messages: [...messages, ...(toolMessages ?? [])],
                        done: false,
                        // 这里为 false 所以会继续循环
                    };
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

        // 每一轮都通过一个完整的 Runnable chain（LLM + 工具调用处理）
        state = await agentStepChain.invoke(state);

        if (state.done) {
            console.log(`\n✨ AI 最终回复:\n${state.final}\n`);
            return state.final;
        }
        // 否则继续循环，messages 里已经包含了工具结果
        // LLM 下一轮会看到完整历史，决定继续调工具还是直接回答
    }
    // 超出最大轮次，返回最后一条消息
    return state.messages[state.messages.length - 1].content;
}

await runAgentWithTools("成都天府五街附近的酒店，最近的 3 个酒店，拿到酒店图片，打开浏览器，展示每个酒店的图片，每个 tab 一个 url 展示，并且在把那个页面标题改为酒店名");

// await mcpClient.close();
