# LCEL 实战：用 Runnable 重构 MCP / RAG 案例

## 学习目标

上一章学了 Runnable 的各种 API，这章把之前做过的两个实战（MCP 多工具协作、RAG 电子书语义助手）**用 LCEL 方式重写**，感受声明式写法和之前命令式写法的差异。同时补充 `withRetry`、`withFallbacks`、`withConfig`、`withCallbacks` 四个增强 API。

## 涉及文件

| 文件 | 核心作用 |
|------|---------|
| `cases/mcp-test.mjs` | MCP Agent Loop 用 LCEL 重写（RunnableBranch + RunnablePassThrough） |
| `cases/ebook-reader-rag.mjs` | RAG 电子书助手用 LCEL 重写（Sequence + Lambda + stream） |
| `runnables/RunnableWithRetry.mjs` | 给 Runnable 节点加自动重试 |
| `runnables/RunnableWithFallbacks.mjs` | 给 Runnable 节点加降级备选 |
| `runnables/RunnableWithConfig.mjs` | 通过 config 跨节点传参 |
| `runnables/RunnableWithCallbacks.mjs` | 链上节点生命周期回调 |

---

## 1. MCP Agent Loop（LCEL 版）

**旧写法 vs 新写法对比：**

```
旧写法（命令式）：                     新写法（LCEL）：
─────────────────────                 ─────────────────────
for (let i = 0; i < max; i++) {      agentStepChain =
  // 手动调模型                          RunnablePassthrough.assign({
  const resp = await model.invoke(msgs)    response: llmChain,    // 调模型
  // 手动判断是否有 tool_calls            })
  if (!resp.tool_calls) {              .pipe(
    return resp                         RunnableBranch.from([
  }                                       [无tool_calls → 返回final],
  // 手动循环调用工具                       [有tool_calls → 调工具→写回messages],
  for (const tc of resp.tool_calls)     ])
    await tool.invoke(tc.args)         )
  // 手动管理 state
  state.messages.push(...)            // 外部只需 for 循环 invoke(chain)
}
```

**核心改造思路：**

```js
// ① agentStepChain 就是一轮完整的「思考 + 行动」
const agentStepChain = RunnableSequence.from([
  // step1: 调用 LLM，结果挂到 state.response
  RunnablePassthrough.assign({ response: llmChain }),

  // step2: 根据有没有 tool_calls 做分支
  RunnableBranch.from([
    // 分支1：没有 tool_calls → 标记 done，返回 final
    [(state) => !state.response?.tool_calls?.length,
      (state) => ({ ...state, done: true, final: state.response.content })
    ],
    // 默认：有 tool_calls → 调工具 → 写回 messages
    RunnableSequence.from([
      RunnablePassthrough.assign({ toolMessages: toolExecutor }),
      (state) => ({ ...state, messages: [...state.messages, ...state.toolMessages], done: false }),
    ]),
  ]),
]);

// ② 外部循环：每次 invoke 一轮，done 就停
for (let i = 0; i < maxIterations; i++) {
  state = await agentStepChain.invoke(state);
  if (state.done) return state.final;
}
```

**关键理解：**
- `state` 对象贯穿整条 chain，承载 `messages`、`tools`、`done`、`final`
- `RunnablePassthrough.assign()` 在不丢弃原 state 的前提下追加字段
- `RunnableBranch` 天然适合「if tool_calls → else」的判断
- 工具执行逻辑封装在 `RunnableLambda` 里，可单独测试和复用

---

## 2. RAG 电子书助手（LCEL 版）

**流程拆解：**

```
用户问题 → Milvus 检索 → 构建 Prompt → 调 LLM → 流式输出
```

**LCEL 链：**

```js
const ragChain = RunnableSequence.from([
  // ① 向量检索
  milvusSearch,           // RunnableLambda：输入{question,k} → embedding → Milvus.search

  // ② 构建 prompt 输入（拼接 context + 日志打印）
  buildPromptInput,       // RunnableLambda：格式化检索结果

  // ③ 无结果兜底
  (input) => input.hasContext
    ? { question: input.question, context: input.context }
    : { question: input.question, context: "", answer: "抱歉未找到..." },

  // ④ PromptTemplate + LLM + 文本输出
  promptTemplate,         // 填充 {question} 和 {context}
  model,                  // ChatOpenAI.invoke
  new StringOutputParser(), // 提取 content 字符串
]);

// 流式输出
const stream = await ragChain.stream({ question: "鸠摩智会什么武功？", k: 5 });
for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

**关键理解：**
- 每个步骤是独立的 Runnable，改其中一个不影响其他
- `RunnableLambda` 包住 Milvus 原生 SDK 调用，让非 LangChain 组件也能参与 chain
- `.stream()` 自动流式输出 `StringOutputParser` 之后的每个 chunk

---

## 3. 增强能力：withRetry / withFallbacks / withConfig / withCallbacks

### withRetry — 自动重试

```js
const unstableRunnable = RunnableLambda.from(async (input) => {
  if (Math.random() < 0.7) throw new Error("随机失败");
  return `成功: ${input}`;
});

// 一行加重试：最多 5 次
const withRetry = unstableRunnable.withRetry({ stopAfterAttempt: 5 });
```

### withFallbacks — 降级备选

```js
// 依次尝试 premium → standard → local
const translator = premiumTranslator.withFallbacks({
  fallbacks: [standardTranslator, localTranslator],
});
// premium 报错 → 自动尝试 standard → 再失败 → local
```

### withConfig — 跨节点配置

```js
// config 作为每个 Runnable 的第二个参数
const fetchUser = RunnableLambda.from(async (input, config) => {
  const userId = config?.configurable?.userId;
  // ...
});

// 绑定配置，后续调用不需要重复传
const chainWithConfig = chain.withConfig({
  configurable: { userId: 'user-123', role: '管理员', locale: 'zh-CN' },
});
await chainWithConfig.invoke('通知内容');
```

### withCallbacks — 生命周期观测

```js
const callback = {
  handleChainStart(chain) { console.log('[START]', chain.id); },
  handleChainEnd(output)   { console.log('[END]', output); },
  handleChainError(err)    { console.log('[ERROR]', err.message); },
};

await chain.invoke('input', { callbacks: [callback] });
```

---

## LCEL 开发心法

```
① 分析流程，拆成原子步骤
② 根据步骤关系选 Runnable：
    顺序 → RunnableSequence / .pipe()
    并行 → RunnableMap
    分支 → RunnableBranch / RouterRunnable
    自定义 → RunnableLambda
③ 统一调用：invoke / stream / batch
④ 按需增强：
    需要重试 → .withRetry({ stopAfterAttempt })
    需要降级 → .withFallbacks({ fallbacks: [...] })
    需要传参 → .withConfig({ configurable: {...} })
    需要观测 → invoke(input, { callbacks: [...] })
```

## 心得总结

- **命令式 → 声明式** 的核心收益：代码读起来就是流程图，不需要跟踪中间变量
- `state` 对象是 Agent loop 的关键——它承载了 messages、tools、done 标记，在 chain 的每一步间流转
- `RunnableLambda` 是把「非 LangChain 原生组件」（如 Milvus SDK）接入 chain 的万能适配器
- 四个增强 API 都是**横向切面**——不侵入节点内部逻辑，从外部加持
