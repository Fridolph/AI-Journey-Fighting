# Runnable：把写逻辑变成组装 Chain（LCEL）

## 学习目标与背景

之前写 LangChain 代码是**命令式**的：手动依次调用 `promptTemplate.format()` → `model.invoke()` → `outputParser.invoke()`。当步骤多了之后，代码冗长且不直观。

LangChain 的核心组件（PromptTemplate、ChatOpenAI、OutputParser 等）都实现了 **Runnable 接口**，可以用**声明式**的方式组装 chain，这种写法叫 **LCEL（LangChain Expression Language）**。

**核心转变：**
```
命令式：写逻辑                    声明式（LCEL）：组装 chain
─────────────────────────         ─────────────────────────
const r1 = await step1(input)     const chain = step1
const r2 = await step2(r1)           .pipe(step2)
const r3 = await step3(r2)           .pipe(step3)
                                  const result = await chain.invoke(input)
```

## 文件一览

| 文件 | 核心作用 |
|------|---------|
| `before.mjs` | 命令式写法（对比基准） |
| `runnable.mjs` | LCEL 声明式写法，RunnableSequence / pipe |
| `RunnableLambda.mjs` | 把普通函数封装成 Runnable |
| `RunnableMap.mjs` | 并行执行多个 Runnable |
| `RunnableBranch.mjs` | if-else 条件分支 |
| `RouterRunnable.mjs` | switch-case 路由匹配 |
| `RunnablePassthrough.mjs` | 保留原始输入 + 扩展属性 |
| `RunnableEach.mjs` | 数组循环处理 |
| `RunnablePick.mjs` | 从对象中提取属性 |
| `RunnableWithMessageHistory.mjs` | 给 chain 加对话记忆 |
| `RunnableWithFallbacks.mjs` | 失败时降级备用 |
| `RunnableWithRetry.mjs` | 失败时自动重试 |
| `RunnableWithCallbacks.mjs` | 链上每一步的生命周期回调 |
| `RunnableWithConfig.mjs` | 通过 config 传参，实现链条运行时配置化 |

---

## 1. before vs runnable — 命令式 vs 声明式

**before.mjs（命令式）：**
```js
// 依次手动调用，每步存中间变量
const formattedPrompt = await promptTemplate.format(input);
const response = await model.invoke(formattedPrompt);
const result = await outputParser.invoke(response);
```

**runnable.mjs（声明式 / LCEL）：**
```js
// 两种等价写法：
const chain = RunnableSequence.from([promptTemplate, model, outputParser]);
// 或
const chain = promptTemplate.pipe(model).pipe(outputParser);

// 一行调用
const result = await chain.invoke(input);
```

**关键理解：**
- `.pipe()` 返回的也是 `RunnableSequence`，和 `RunnableSequence.from()` 本质一样
- `chain.invoke(input)` 时，数据自动依次流过每个组件
- 每个组件只需实现 `invoke(上一步输出, config)` 接口

---

## 2. RunnableLambda — 普通函数变 Runnable

```js
const addOne = RunnableLambda.from((input) => input + 1);
const multiplyTwo = RunnableLambda.from((input) => input * 2);

const chain = RunnableSequence.from([addOne, multiplyTwo, addOne]);

await chain.invoke(5);  // 5 → 6 → 12 → 13
```

**关键：** 任何普通函数包进 `RunnableLambda.from(fn)` 就能参与 chain 组装。

---

## 3. RunnableMap — 并行执行

```js
const runnableMap = RunnableMap.from({
  add: (input) => input.num + 1,         // 自动转为 RunnableLambda
  multiply: (input) => input.num * 2,
  greeting: PromptTemplate.fromTemplate("你好，{name}！"),
});

// 输入 { num: 5, name: "神光" }
// 输出 { add: 6, multiply: 10, greeting: "你好，神光！" }
```

**关键：** map 里的每个 Runnable 接收**整个 input 对象**，各自消费自己需要的字段，并行执行，结果合并到一个对象。

---

## 4. RunnableBranch — if-else 逻辑

```js
const branch = RunnableBranch.from([
  [(input) => input > 0,  (input) => `正数: ${input}`],   // if
  [(input) => input < 0,  (input) => `负数: ${input}`],   // else if
  [(input) => input % 2 === 0, (input) => `偶数: ${input}`], // else if
  (input) => `默认: ${input}`                             // else
]);
```

**注意：** Branch 按顺序匹配，第一个条件为 true 就执行，后面的不再判断。所以输入 `5` 命中第一个条件 `isPositive`，不会走到 `isEven`。

---

## 5. RouterRunnable — switch-case

```js
const router = new RouterRunnable({
  runnables: { toUpperCase, reverseText },
});

await router.invoke({ key: "reverseText", input: "Hello" });
// → 根据 key 决定执行哪个 runnable
```

---

## 6. RunnablePassthrough — 保留原始值

```js
const chain = RunnableSequence.from([
  (input) => ({ concept: input }),
  RunnablePassthrough.assign({
    original: new RunnablePassthrough(),   // 拿到原始输入
    processed: (obj) => ({ upper: obj.concept.toUpperCase() }),
  })
]);

// 输入 "hello"
// 输出 { concept: "hello", original: { concept: "hello" }, processed: { upper: "HELLO" } }
```

**两个用法：**
- `new RunnablePassthrough()` — 直接透传当前值
- `RunnablePassthrough.assign({...})` — 类似 `Object.assign`，保留现有属性并扩展新属性

**简化写法：** LangChain 会自动把普通函数转 `RunnableLambda`、对象转 `RunnableMap`，所以代码里可以直接写箭头函数和对象，不需要显式包一层。

---

## 7. RunnableEach — 循环数组

```js
const processItem = RunnableSequence.from([toUpperCase, addGreeting]);

const chain = new RunnableEach({ bound: processItem });

await chain.invoke(["alice", "bob", "carol"]);
// → ["你好，ALICE！", "你好，BOB！", "你好，CAROL！"]
```

---

## 8. RunnablePick — 取对象属性

```js
const chain = RunnableSequence.from([
  (input) => ({ ...input, fullInfo: `${input.name}，${input.age}岁` }),
  new RunnablePick(["name", "fullInfo"]),  // 只保留这两个 key
]);
```

---

## 9. RunnableWithMessageHistory — 加 Memory

```js
const prompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个简洁、有帮助的中文助手...'],
  new MessagesPlaceholder('history'),     // ← 对话历史插入点
  ['human', '{question}'],
]);

const simpleChain = prompt.pipe(model).pipe(new StringOutputParser());

const chain = new RunnableWithMessageHistory({
  runnable: simpleChain,
  getMessageHistory: (sessionId) => messageHistories.get(sessionId),
  inputMessagesKey: 'question',           // 当前问题从哪个字段取
  historyMessagesKey: 'history',          // 历史插入到哪个 MessagesPlaceholder
});

// 调用时需传 configurable.sessionId
await chain.invoke(
  { question: '我的名字是神光...' },
  { configurable: { sessionId: 'user-123' } }
);
```

**效果：** 同一 sessionId 的对话历史自动累积，第二次调用时 AI 能「记住」之前说过的话。

---

## 10. RunnableWithFallbacks — 降级备用

```js
const translator = premiumTranslator.withFallbacks({
  fallbacks: [standardTranslator, localTranslator],
});
// 依次尝试 premium → standard → local
```

---

## 11. RunnableWithRetry — 自动重试

```js
const runnableWithRetry = unstableRunnable.withRetry({
  stopAfterAttempt: 5,
});
```

---

## 12. RunnableWithCallbacks — 生命周期钩子

```js
const callback = {
  handleChainStart(chain) { console.log('[START]', chain.id); },
  handleChainEnd(output)   { console.log('[END]', output); },
  handleChainError(err)    { console.log('[ERROR]', err.message); },
};

await chain.invoke('hello world', { callbacks: [callback] });
```

---

## 13. RunnableWithConfig — 配置化传参

```js
const fetchUser = RunnableLambda.from(async (input, config) => {
  const userId = config?.configurable?.userId;  // 从 config 取值
  // ...
});

const chain = RunnableSequence.from([fetchUser, checkPermission, format]);

// 绑定配置
const chainWithConfig = chain.withConfig({
  configurable: { userId: 'user-123', role: '管理员', locale: 'zh-CN' },
});

await chainWithConfig.invoke('通知内容');
```

**关键：** `config` 是每个 Runnable 的第二个参数，贯穿整条 chain，可用于传递用户信息、权限、语言等运行时上下文。

---

## API 速查

| Runnable | 用途 | 类比 |
|----------|------|------|
| `RunnableSequence` / `.pipe()` | 顺序串联 | 管道 `|` |
| `RunnableMap` | 并行执行 | `Promise.all` |
| `RunnableLambda` | 普通函数包装 | 函数转节点 |
| `RunnableBranch` | 条件分支 | `if-else` |
| `RouterRunnable` | 路由匹配 | `switch-case` |
| `RunnablePassthrough` | 透传原始值 | 透传 / `Object.assign` |
| `RunnableEach` | 循环处理 | `Array.map` |
| `RunnablePick` | 提取属性 | 对象解构 |
| `RunnableWithMessageHistory` | 加对话记忆 | Memory |
| `withFallbacks()` | 失败降级 | try-catch 备用 |
| `withRetry()` | 自动重试 | retry 策略 |
| `withConfig()` | 绑定配置 | 依赖注入 |

## 三种统一调用方式

```js
// 所有 Runnable 都支持：
await chain.invoke(input)         // 单次调用
await chain.batch([in1, in2])     // 批量并发
for await (const chunk of await chain.stream(input))  // 流式
```

---

## 心得总结

### LCEL 的核心思想

**从「命令式调用」变成「声明式组装 chain」**，类比前端：

```
命令式（old）                         声明式 LCEL
──────────────────────────           ──────────────────────────
let result = []                      arr.map(x => x+1)
for (let i of arr) {                    .filter(x => x>3)
  let r = await step1(i)               .sort()
  let r2 = await step2(r)               .join()
}

const r1 = await promptTemplate        promptTemplate
  .format(input)                         .pipe(model)
const r2 = await model.invoke(r1)        .pipe(outputParser)
const r3 = await outputParser            .invoke(input)
  .invoke(r2)
```

每个组件只管自己的 `invoke`，数据自动流转。`.pipe()` 就是胶水。

### 本章练习回顾（`examples/runnable-test/src/fri/`）

| 练习 | 文件 | 掌握点 | 踩坑 |
|------|------|--------|------|
| ① | `1.mjs` | `RunnableSequence` 顺序链，数据 `10→15→45→43` | — |
| ② | `2.mjs` | `RunnableMap` 并行处理，结果按 key 合并 | `invoke()` 忘加 `await`；`PromptTemplate` 不需要包 async 函数 |
| ③ | `3.mjs` | Sequence + Map 混用：串行中嵌并行 + 追加步骤 | `RunnableMap.from()` 不需要 `await` |
| ④ | `4.mjs` | `RunnableBranch` if-else 条件分支 | 短路匹配：条件函数都执行但 handler 只执行一个 |
| ⑤ | `5.mjs` | `RouterRunnable` switch-case 路由 | RouterRunnable 的 handler 必须用 `RunnableLambda.from()` 包；不需要外面再套 Branch |
| ⑥ | `6.mjs` | `RunnablePassthrough.assign()` 保留原属性 + 扩展 | — |
| ⑦ | `7.mjs` | `RunnableWithMessageHistory` 对话记忆 | 缺 `import 'dotenv/config'` |

### 不需要死记

Runnable API 很多，但日常最常用的就是四个模式：

```
顺序：RunnableSequence / .pipe()
并行：RunnableMap
分支：RunnableBranch / RouterRunnable
循环：RunnableEach
```

外加两个实用增强：`RunnableWithMessageHistory`（记忆）、`withRetry`（重试）。

## 下一步方向

进入下一章：LCEL 实战练习，用 chain 方式重构更多实际场景。

---

## 章末总结：Runnable / LCEL 全回顾

### 学完这章，你掌握了什么

| 层次 | 内容 | 在哪练的 |
|------|------|---------|
| 核心 API | `RunnableSequence`、`RunnableMap`、`RunnableBranch`、`RunnableLambda` | fri/ + practice/step1~8 |
| 补充 API | `RouterRunnable`、`RunnablePassthrough`、`RunnablePick`、`RunnableEach` | fri/ + 文章原文 |
| 增强 API | `withRetry`、`withFallbacks`、`withConfig`、`withCallbacks` | step7 + 原文 runnables/ |
| 记忆 | `MessagesPlaceholder` + `RunnableWithMessageHistory` + 手动 runWithMemory | step3~4, step8 |
| 实战案例 | MCP Agent Loop、RAG 电子书助手 | cases/mcp-test-fix.mjs, cases/ebook-reader-rag-fix.mjs |
| 心智模型 | `Answer = chain(input)`，Prompt → Model → Parser | MENTAL-MODEL.mjs, AI-me.md |

### 关键踩坑记录

| 坑 | 现象 | 解决 |
|----|------|------|
| `RunnableSequence.from()` 加 `await` | 不影响运行但多余 | `from()` 是同步的 |
| PromptTemplate 占位符和 invoke key 不匹配 | `Missing value for input` | 模板 `{xxx}` ↔ invoke `{ xxx }` 必须一致 |
| Pipeline finalPrompt 被注释 | `Cannot read properties of undefined` | 检查 `finalPrompt` 是否定义 |
| `RunnableBranch` handler 放字符串 | `Expected a Runnable` | 用 `RunnableLambda.from()` 包 |
| `RunnableMap.from()` 参数是对象不是数组 | 语法错误 | `{ key: chain }` 不是 `[chain1, chain2]` |
| `RunnableWithMessageHistory` 废弃 | deprecated 警告 | 改用手动 `runWithMemory(sessionId, messages[])` |
| DeepSeek thinking mode Agent Loop | 400 `reasoning_content must be passed back` | 改用 `deepseek-chat`（非 thinking 模型） |
| DeepSeek 不支持 embeddings | `MODEL_NOT_FOUND` 404 | Chat 和 Embedding 分离配置，Embedding 用千问 |
| `dotenv/config` 找错 .env 路径 | 环境变量全 undefined | 统一用 `npm run` 或显式 `dotenv.config({ path })` |

### LCEL 开发心法

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

万能起手式：
    PromptTemplate → ChatOpenAI → StringOutputParser
    chain.invoke({ question: '...' })
```
