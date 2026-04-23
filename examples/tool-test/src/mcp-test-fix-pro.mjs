import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { ChatOpenAI } from '@langchain/openai';
import chalk from 'chalk';
import { HumanMessage, ToolMessage } from '@langchain/core/messages';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getModelConfig } from './model-config.mjs';

const model = new ChatOpenAI(getModelConfig());

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const projectRoot = path.resolve(currentDir, '..');
const localMcpServerPath = path.join(currentDir, 'my-mcp-server.mjs');
const allowedPaths = (process.env.ALLOWED_PATHS || projectRoot)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    'my-mcp-server': {
      command: 'node',
      args: [localMcpServerPath],
    },
    'amap-maps-streamableHTTP': {
      url: `https://mcp.amap.com/mcp?key=${process.env.AMAP_MAPS_API_KEY ?? ''}`,
    },
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', ...allowedPaths],
    },
    'chrome-devtools': {
      command: 'npx',
      args: ['-y', 'chrome-devtools-mcp@latest'],
    },
  },
});

const tools = await mcpClient.getTools();
const modelWithTools = model.bindTools(tools);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

// 新增：统一把工具返回结果转成字符串，避免 ToolMessage content 类型不匹配
function toToolContentString(toolResult) {
  if (typeof toolResult === 'string') return toolResult;

  if (toolResult && typeof toolResult === 'object') {
    if (typeof toolResult.text === 'string') {
      return toolResult.text;
    }

    // 新增：兼容 MCP 常见的 content 数组结构
    const content = toolResult.content;
    if (Array.isArray(content)) {
      const textParts = content
        .map((item) => {
          if (item && typeof item === 'object' && 'text' in item) {
            const text = item.text;
            return typeof text === 'string' ? text : '';
          }
          return '';
        })
        .filter(Boolean);

      if (textParts.length > 0) {
        return textParts.join('\n');
      }
    }
  }

  try {
    return JSON.stringify(toolResult);
  } catch {
    return String(toolResult);
  }
}

// 新增：只对“可能是临时故障”的错误做自动重试（超时/限流/5xx/连接抖动）
function isRetryableError(error) {
  const message = normalizeError(error).toLowerCase();
  const status = error?.status;
  const code = typeof error?.code === 'string' ? error.code.toUpperCase() : '';

  if (typeof status === 'number' && (status === 429 || status >= 500)) return true;
  if (code && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code)) return true;
  if (message.includes('timeout') || message.includes('rate limit') || message.includes('temporarily unavailable')) {
    return true;
  }

  return false;
}

// 新增：工具调用封装（失败可重试），并把结果统一成可写入 ToolMessage 的字符串
async function invokeToolWithRetry(toolCall, foundTool, options) {
  let attempt = 0;
  const maxAttempts = options.maxToolRetries + 1;

  while (attempt < maxAttempts) {
    try {
      const toolResult = await foundTool.invoke(toolCall.args);
      const content = toToolContentString(toolResult);
      return { ok: true, content };
    } catch (error) {
      const errorMsg = normalizeError(error);
      const retryable = isRetryableError(error);
      const isLastAttempt = attempt === maxAttempts - 1;

      console.warn(
        chalk.yellow(
          `⚠️ 工具 ${toolCall.name} 第 ${attempt + 1}/${maxAttempts} 次失败: ${errorMsg}${retryable && !isLastAttempt ? '（将重试）' : ''}`
        )
      );

      if (!retryable || isLastAttempt) {
        return {
          ok: false,
          content: `工具 ${toolCall.name} 调用失败: ${errorMsg}`,
        };
      }

      // 新增：简单指数退避，避免连续高频重试
      const backoff = options.retryDelayMs * 2 ** attempt;
      await sleep(backoff);
      attempt += 1;
    }
  }

  return {
    ok: false,
    content: `工具 ${toolCall.name} 调用失败: 未知错误`,
  };
}

async function runAgentWithTools(query, userOptions = {}) {
  // 新增：统一默认参数，便于后续调用只改关键项
  const options = {
    maxIterations: userOptions.maxIterations ?? 30,
    maxToolRetries: userOptions.maxToolRetries ?? 2,
    retryDelayMs: userOptions.retryDelayMs ?? 600,
  };

  const messages = [new HumanMessage(query)];

  for (let i = 0; i < options.maxIterations; i++) {
    const isLastChance = i === options.maxIterations - 1;

    // 新增：最后一轮先强制收尾，减少“最后一步还在继续调工具”概率
    if (isLastChance) {
      messages.push(
        new HumanMessage('你已经到达最后一次迭代机会。请直接给出最终答案，不要再调用工具。')
      );
    }

    console.log(chalk.bgGreen('⏳ 正在等待 AI 思考...'));
    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      const finalContent = typeof response.content === 'string' ? response.content : String(response.content ?? '');
      console.log(`\n✨ AI 最终回复:\n${finalContent}\n`);
      return { success: true, content: finalContent, iterations: i + 1 };
    }

    console.log(chalk.bgBlue(`🔍 检测到 ${response.tool_calls.length} 个工具调用`));
    console.log(chalk.bgBlue(`🔍 工具调用: ${response.tool_calls.map((t) => t.name).join(', ')}`));

    // 新增：如果最后一轮仍然想调工具，明确返回失败而不是静默空字符串
    if (isLastChance) {
      return {
        success: false,
        content: null,
        iterations: options.maxIterations,
        error: `超出最大迭代次数 ${options.maxIterations}，任务未完成（最后一轮仍有工具调用）。`,
      };
    }

    // 说明：这里仍是串行执行（单线程），但单个工具失败不会中断整个循环
    for (const toolCall of response.tool_calls) {
      const foundTool = tools.find((t) => t.name === toolCall.name);

      let contentStr = '';
      if (!foundTool) {
        // 新增：工具未注册时，也写入 ToolMessage，让模型感知失败并尝试降级
        contentStr = `工具 ${toolCall.name} 未找到，请检查 mcpClient.getTools() 的注册结果。`;
      } else {
        const toolRun = await invokeToolWithRetry(
          {
            id: toolCall.id,
            name: toolCall.name,
            args: toolCall.args ?? {},
          },
          foundTool,
          options
        );
        contentStr = toolRun.content;
      }

      messages.push(
        new ToolMessage({
          content: contentStr,
          // 新增：tool_call_id 兜底，避免异常结构导致崩溃
          tool_call_id: toolCall.id ?? `unknown-tool-call-id-${toolCall.name}`,
        })
      );
    }
  }

  // 新增：理论上不会走到这里，保底给出明确失败语义
  return {
    success: false,
    content: null,
    iterations: options.maxIterations,
    error: `超出最大迭代次数 ${options.maxIterations}，任务未完成。`,
  };
}

try {
  const result = await runAgentWithTools(
    '成都世纪城附近的酒店，最近的 3 个酒店，拿到酒店图片，打开浏览器，展示每个酒店的图片，每个 tab 一个 url 展示，并且把页面标题改为酒店名',
    {
      maxIterations: 30,
      maxToolRetries: 2,
      retryDelayMs: 600,
    }
  );

  if (!result.success) {
    console.error(chalk.red(`\n❌ 任务失败: ${result.error}\n`));
  }
} finally {
  // 新增：无论成功失败都关闭 MCP Client，避免 stdio 子进程残留
  await mcpClient.close();
}

