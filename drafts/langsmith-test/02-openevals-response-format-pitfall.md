# OpenEvals response_format 踩坑记录

> 日期：2026-07-29
> 关联文档：[01 LangSmith 全链路观测 + Evaluation](./01-langsmith-fullstack-tracing.md)
> 涉及文件：
> - `examples/langsmith-test/src/eval/evaluators.mjs`（原始）
> - `examples/langsmith-test/src/eval/evaluators-fix.mjs`（修复版）
> - `examples/langsmith-test/src/eval/run_eval-fix.mjs`（修复版入口）

---

## 一、问题现象

跑 `pnpm eval:run` 时全部 evaluator 报 400：

```
Error: 400 This response_format type is unavailable now
```

评测流程能启动（依赖锁定修复后），但三个评分维度全部失败，无一例外。

---

## 二、根因分析

### 2.1 openevals 源码两条分支都会设 response_format

`openevals/dist/llm.js` 的 `createLLMAsJudge` 内部有两个分支：

**分支 1（第 246 行）— `_isBaseChatModel(judge)` 为 true（用 ChatOpenAI 实例）**

```js
const judgeWithStructuredOutput = judge.withStructuredOutput(schema);
response = await judgeWithStructuredOutput.invoke(lcMessages);
```

`@langchain/openai` 的 `withStructuredOutput` 默认走 `method: "jsonSchema"`，发送 `response_format: { type: "json_schema", json_schema: {...} }`。

**分支 2（第 281 行）— else（用原生 OpenAI client）**

```js
response_format: {
    type: "json_schema",
    json_schema: openaiJsonSchema,
},
```

硬编码 `json_schema`，没有开关可以关闭。

### 2.2 DeepSeek V4 Flash 不兼容

```txt
DeepSeek V4 Flash 的限制：
  response_format: { type: "json_schema" }   → ❌ 不支持，返回 400
  response_format: { type: "json_object" }   → ❌ 要求 Prompt 包含 "json" 关键词
  tool_choice（functionCalling）              → ❌ thinking mode 下不支持
  不加 response_format                        → ❌ LLM 不输出 JSON，openevals 解析失败
```

**所有方案都绕不开**：openevals 0.2.0 强制依赖 `response_format`，DeepSeek V4 Flash 全线不支持。

---

## 三、5 次调试迭代

| # | 方案 | 错误 | 结论 |
|---|------|------|------|
| 1 | Proxy 拦截 `withStructuredOutput`，强制 `method: "functionCalling"` | `400 Thinking mode does not support this tool_choice` | thinking mode 不支持 tool_choice |
| 2 | 改 judge 模型为 `deepseek-chat`（DeepSeek V3） | `400 response_format type unavailable` | V3 同样不支持 |
| 3 | 原生 OpenAI client + Proxy 拦截 create 参数，删除 `response_format` | `SyntaxError: not valid JSON` | 无约束时 LLM 随便说话 |
| 4 | 改为 `response_format: { type: "json_object" }` | `400 Prompt must contain 'json'` | 需要 Prompt 含"json" |
| 5 | **judge 单独换千问 qwen-plus** | ✅ 零报错通过 | 千问支持 json_schema |

### 3.1 方案 1 详解：Proxy 拦截 withStructuredOutput

```js
const judge = new Proxy(rawJudge, {
  get(target, prop) {
    if (prop === "withStructuredOutput") {
      return (schema, config) =>
        target.withStructuredOutput(schema, {
          method: "functionCalling",
          ...config,
        });
    }
    return Reflect.get(target, prop);
  },
});
```

**结果**：`400 Thinking mode does not support this tool_choice`。DeepSeek V4 Flash 在 thinking mode 下不支持 `tool_choice` 参数。但关掉 thinking mode（加 `temperature` 不行，这是模型自身特性）。

### 3.2 方案 3 详解：拦截 chat.completions.create

```js
const openai = new OpenAI({...});
const originalCompletions = openai.chat.completions;
openai.chat.completions = new Proxy(originalCompletions, {
  get(target, prop) {
    if (prop === "create") {
      return async (params, options) => {
        const cleanedParams = { ...params };
        delete cleanedParams.response_format;
        return target.create.call(target, cleanedParams, options);
      };
    }
    return Reflect.get(target, prop);
  },
});
```

**结果**：没有 400 了，但 LLM 返回了自然语言文本（如 "The output shows that..."），openevals 第 321 行 `JSON.parse(response.choices[0].message.content)` 报错 `SyntaxError: not valid JSON`。

### 3.3 方案 4 详解：改为 json_object

```js
if (cleanedParams.response_format?.type === "json_schema") {
  cleanedParams.response_format = { type: "json_object" };
}
```

**结果**：`400 Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'.` DeepSeek 要求 `json_object` 模式下，system 或 user prompt 中必须包含 "json" 关键词（openevals 的内置 prompt `RAG_GROUNDEDNESS_PROMPT` 等不满足）。

### 3.4 最终方案：千问 qwen-plus 做评分

```js
const judge = new ChatOpenAI({
  apiKey: process.env.EMBEDDINGS_API_KEY,
  configuration: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  model: "qwen-plus",
  temperature: 0,
});
```

千问 DashScope 的兼容 API 完整支持 `response_format: { type: "json_schema" }`，openevals 无需任何修改即可正常工作。

---

## 四、最终架构

```txt
用户问题 → RAG Agent（deepseek-v4-flash）
              ↓ 答案 + 检索上下文
         千问 qwen-plus（评分）
              ↓ groundedness / helpfulness / retrieval_relevance
         LangSmith 记录
```

**两个模型各走各的 API，互不影响：**

| 用途 | 模型 | API Key | Base URL |
|------|------|---------|----------|
| RAG 问答 | deepseek-v4-flash | `OPENAI_API_KEY`（DeepSeek） | `api.deepseek.com` |
| LLM 评分 | qwen-plus（千问） | `EMBEDDINGS_API_KEY`（千问） | `dashscope.aliyuncs.com` |

---

## 五、文件对照

| 原始文件 | 修复版文件 | 差异 |
|---------|-----------|------|
| `evaluators.mjs` | `evaluators-fix.mjs` | judge 从 DeepSeek ChatOpenAI 改为千问 ChatOpenAI |
| `run_eval.mjs` | `run_eval-fix.mjs` | import 路径改为 `evaluators-fix.mjs` |

---

## 六、教训

```
1. 选模型前先确认 API 参数兼容性
   response_format（json_schema / json_object）、tool_choice 等
   不同厂商、不同模型对 OpenAI 兼容 API 的实现完整度差异很大

2. LLM-as-Judge 的评分模型和问答模型可以是不同厂商
   评分只需要结构化输出能力，不需要 thinking mode
   所以千问 qwen-plus 做评分、DeepSeek V4 Flash 做问答是合理分工

3. openevals 0.2.0 强制依赖 response_format，无法绕过
   如果评分模型不支持，只能换模型，不能通过配置关闭

4. 调试类似问题的方法
   → 先读 openevals 源码确认关键路径
   → 用 Proxy 拦截 API 参数观察实际发送了什么
   → 逐步缩小范围（模型 → 参数 → 模型厂商）
```

---

*昇哥 · 2026年7月*
