# 02 — naive-rag 与 query-router：从固定管道到动态路由

> 学习日期：2026-05-24
> 原始文件：`examples/advanced-rag/src/naive-rag.mjs` / `rag-query-router.mjs`

---

## 一、学习目标

- 用 LangGraph 的 `StateGraph` 重写传统 RAG 流程
- 理解**路由节点**如何从"所有问题都走检索"升级为"LLM 判断要不要检索"
- 掌握 `withStructuredOutput` 做结构化路由决策

---

## 二、naive-rag.mjs：用图重写 RAG

### 2.1 图结构

```
START → retrieve → generate → END
         (向量搜索)   (LLM流式回答)
```

熟悉的线性图——和 langgraph-test 的 `basic-graph.mjs` 完全同构，只是节点的业务逻辑换成了向量检索和 LLM 生成。

### 2.2 State 定义

```js
const GraphState = Annotation.Root({
    question: Annotation,      // 用户问题
    k: Annotation,             // 检索多少条
    documents: Annotation,     // 检索到的文档
    generation: Annotation,    // 生成的回答
});
```

和 `basic-graph` 的 `StateAnnotation` 对比：

| 字段 | naive-rag 中的角色 | langgraph 对比 |
|------|-------------------|---------------|
| `question` | 用户的原始问题 | 类似 `query` 字段 |
| `k` | 检索条数配置 | 无对应，业务参数 |
| `documents` | 向量检索结果 | 类似 `answer`（最终输出） |
| `generation` | LLM 生成的最终回答 | 类似 `answer` |

### 2.3 retrieve 节点：向量检索

```js
const retrieveNode = async (state) => {
    const documents = await retrieveRelevantContent(state.question, state.k);
    return { question, k, documents };
};
```

背后做的事：`question` → embedding → Milvus `similaritySearchWithScore` → 返回最相似的 k 条文档。

**前端类比**：`fetch('/api/search?q=' + query)` → 返回搜索结果。

### 2.4 generate 节点：LLM 流式回答

```js
const generateNode = async (state) => {
    const context = state.documents
        .map((item, i) => `[片段 ${i + 1}] 章节: ${item.chapter_num} 内容: ${item.content}`)
        .join("\n\n");

    const prompt = `基于小说内容回答问题：${context}\n用户问题: ${state.question}`;

    // 流式输出
    const stream = await model.stream(prompt);
    for await (const chunk of stream) {
        process.stdout.write(chunk.content);
    }
    return { generation };
};
```

关键三步：
1. **拼接 context**：检索到的文档片段 → 拼成 prompt 的"参考材料"部分
2. **构造 prompt**：context + 用户问题 → 发给 LLM
3. **流式输出**：`model.stream(prompt)` → 逐个 token 打印

**前端类比**：`fetch('/api/chat', { body: { context, question } })` + SSE 流式渲染。

### 2.5 核心问题

这个 pipeline **所有问题都走检索**。用户问"1+1=?" 也会去搜 Milvus。浪费、慢、不必要。

---

## 三、rag-query-router.mjs：加上路由判断

### 3.1 图结构

```
START → route_question
              │
        decideNext(state.strategy)
              │
    ┌─────────┴─────────┐
    ▼                   ▼
  simple              complex
    │                   │
direct_answer        retrieve
    │                   │
    ▼                   ▼
  END              rag_generate
                       │
                       ▼
                     END
```

和 `conditional-routing.mjs` 完全同构——多了一个 router 节点 + 条件边分叉。

### 3.2 route_question 节点：LLM 做路由

```js
const RouteSchema = z.object({
  strategy: z.enum(["simple", "complex"]),
  reason: z.string(),
});

const routeQuestionNode = async (state) => {
  const router = routerLlm.withStructuredOutput(RouteSchema, {
    method: "functionCalling",
    name: "route_question",
  });
  const route = await router.invoke(`
你是问答路由器。判断用户问题是否需要外部检索。
- simple: 常识问答、简短定义
- complex: 需要《天龙八部》具体情节、人物关系、原文细节
用户问题：${state.question}
  `);
  return { strategy: route.strategy, routeReason: route.reason };
};
```

**两个新概念：**

| 概念 | 是什么 | 前端类比 |
|------|--------|---------|
| `z.object({ strategy, reason })` | Zod schema — 定义 LLM 输出的"类型" | TypeScript `interface` |
| `withStructuredOutput(schema)` | 让 LLM 按指定格式返回 JSON | 后端 API 的 response schema |

这比 langgraph-test 的 `conditional-routing` 更智能——判断逻辑从正则表达式升级成了 LLM。

```
之前：conditional-routing   正则 /[+\-*/]/    "你好"→chat, "10*8"→math
现在：rag-query-router       LLM 语义判断     "1+1=?"→simple, "虚竹的身世"→complex
```

### 3.3 兼容性踩坑

| 问题 | 原因 | 修复 |
|------|------|------|
| `response_format type unavailable` | 部分模型不支持 `json_schema` | `method: "functionCalling"` |
| `thinking mode does not support tool_choice` | thinking 模型不支持 function calling | 拆两个实例：routerLlm（关 thinking）+ llm（正常） |

```js
// 路由专用 LLM：关 thinking，支持 function calling
const routerLlm = new ChatOpenAI({
    model: "deepseek-v4-flash",
    modelKwargs: { thinking: { type: "disabled" } },
});
const router = routerLlm.withStructuredOutput(RouteSchema, {
    method: "functionCalling",
    name: "route_question",
});
```

### 3.4 decideNext 条件边

```js
function decideNext(state) {
  return state.strategy === "simple" ? "direct_answer" : "retrieve";
}

.addConditionalEdges("route_question", decideNext, {
  direct_answer: "direct_answer",
  retrieve: "retrieve",
})
```

和 `conditional-routing.mjs` 完全一样的模式——`decideNext` 是从 state 里读 `strategy` 字段（由 LLM 写入），返回路由键，条件边根据路由键跳转。

**数据流：**

```
用户问题 → route_question → LLM 判断 → 写入 state.strategy
                                         ↓
                                  decideNext 读取 → "simple"/"complex"
                                         ↓
                              条件边跳转 → direct_answer / retrieve
```

### 3.5 两个生成节点

**direct_answer — 简单问题直接答：**

```js
const directAnswerNode = async (state) => {
  const stream = await llm.stream(`直接简洁回答问题：${state.question}`);
  // 流式输出...
};
```

不需要 context，不需要检索。一个 prompt + 流式输出就够。

**rag_generate — 复杂问题带 RAG：**

和 `naive-rag` 的 generate 节点一样的逻辑——拼接检索到的 documents 到 context，发给 LLM 生成。

---

## 四、核心洞察

### 🔑 路由节点是 Agentic RAG 的灵魂

从"所有问题都走检索"到"LLM 判断要不要检索"，**一个节点的增加，让 RAG 从死板管道变成了有判断力的系统。**

```
naive-rag:              所有问题 → 检索 → 生成
rag-query-router:       问题 → LLM路由判断 → 简单问题直接答
                                          → 复杂问题检索后再答
```

### 🔑 withStructuredOutput = LLM 的"类型系统"

Zod schema 就像 TypeScript 的 `interface`——你定义 LLM 输出的形状，LLM 保证返回符合这个形状的 JSON。这让 LLM 的输出从"自由文本"变成了"可被代码逻辑处理的程序化数据"。

### 🔑 LangGraph 三要素在此全部出场

| 三要素 | naive-rag | rag-query-router |
|--------|-----------|-----------------|
| State | `{ question, k, documents, generation }` | 同上 + `strategy, routeReason` |
| Node | retrieve, generate | route_question, direct_answer, retrieve, rag_generate |
| Edge | `START→retrieve→generate→END` | 线性边 + 条件边（分叉） |

### 🔑 路由 LLM 和生成 LLM 要分开配置

这是这次踩坑的核心教训——thinking 模型不支持 function calling，功能不一样要拆两个实例。

---

## 五、下一步

路由搞定了，但还有一个更核心的问题：**检索到的内容是否相关？质量够不够？**

`rag-webfallback.mjs` 会引入**评估节点**——检索结果不相关时自动回退到网络搜索。这比"简单的分叉"更进一层：图不仅要判断"走哪条路"，还要判断"走了之后对不对"。
