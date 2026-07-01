# 混合检索 + Rerank 重排：多路召回 + 重排精筛

> 学习日期：2026-06-30
> 示例代码：`examples/es-test/src/rag/`

---

## 一、学习目标

- 理解为什么向量检索 + 关键词检索要**同时用**
- 掌握 Rerank 重排模型的作用——在混合召回之后精筛最相关的文档
- 看懂 query-augment（LLM 改写多角度问句）在混合检索中的角色
- 理解生产级 RAG 的完整通路

---

## 二、为什么混合检索还不够

混合检索解决了"找得全"的问题——ES 管词条匹配、Milvus 管语义匹配。

但**找得全带来了新问题**：两路召回的结果加起来，可能有几十条文档。一把塞给 LLM 会产生三个后果：

| 问题 | 为什么 |
|------|--------|
| **上下文超限** | LLM 的 token 窗口有限，几十条文档塞不下 |
| **噪声干扰** | 不相关的文档越多，LLM 越容易答非所问 |
| **幻觉增加** | 信息量太大，LLM 分不清哪个是真正的依据 |

**所以混合检索之后必须加一步：Rerank。**

---

## 三、Rerank 是什么

### 3.1 和 embedding 模型的对比

| | Embedding 模型 | Rerank 模型 |
|----|---------------|------------|
| 输入 | 一段文本 | 一个问题 + 一段文档 |
| 输出 | 向量（浮点数组） | 一个相关度分数 |
| 做什么 | 把文本转成向量 | 给文档和问题打相关性分 |
| 体量 | 中等 | **极小，推理快，成本低** |

embedding 模型负责"粗筛"——把向量最相近的 K 条文档捞出来。

Rerank 模型负责"精筛"——对捞出来的 K 条逐一打分，取最相关的 top N。

### 3.2 代码调用

```js
// dashscope-rerank.mjs — 封装 DashScope Rerank API
const res = await fetch(process.env.RERANK_URL, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "qwen3-rerank",
    input: {
      query,                                    // 用户问题
      documents: documents.map(d => d.pageContent), // 待评估的文档列表
    },
    parameters: { top_n: 3 },                   // 只取前 3 篇
  }),
});
```

输入一段问题和一堆文档，输出每条文档的 relevance_score，按分数排序取 top_n。

---

## 四、完整流水线

```
用户 query
    │
    ▼
query_augment（LLM 改写 → 3 个角度的问题）
    │
    ├── q1 → ES 关键词检索 → hits_es_1
    ├── q1 → Milvus 语义检索 → hits_milvus_1
    ├── q2 → ES 关键词检索 → hits_es_2
    ├── q2 → Milvus 语义检索 → hits_milvus_2
    ├── q3 → ES 关键词检索 → hits_es_3
    └── q3 → Milvus 语义检索 → hits_milvus_3
              │
              ▼
         全量合并去重（按 id）
              │
              ▼
         Rerank 重排序（取 top 3）
              │
              ▼
         拼 prompt → LLM 流式回答
```

### 4.1 query-augment：改写多角度问句

同一个问题，从不同角度问，召回的结果更全面：

```
# 原始问题
"杭州西湖有什么好玩的"

# LLM 改写
1. 杭州西湖有哪些著名的旅游景点和游览项目
2. 杭州西湖周边有什么值得推荐的休闲活动
3. 杭州西湖游玩攻略与必去目的地
```

每条问题分别走 ES 和 Milvus，相当于 **3 × 2 = 6 路检索**。

### 4.2 合并去重

```js
function mergeUnique(existingDocs, newDocs) {
  const map = new Map();
  for (const d of [...existingDocs, ...newDocs]) {
    const key = String(d.id);
    const prev = map.get(key);
    if (!prev || d.score > prev.score) map.set(key, d);  // 同 id 保留更高分
  }
  return Array.from(map.values());
}
```

同 id 的文档可能被多个 query 或多个通道命中——保留分数更高的那份。

### 4.3 Rerank 精排

```js
const compressor = new DashScopeRerank({ apiKey, topN: 3 });
const topDocs = await compressor.compressDocuments(mergedDocs, query);
```

合并后的可能还有 20+ 条文档。Rerank 对每一条和原始问题做精确的相关性打分，取 top 3。

### 4.4 拼 prompt → LLM

```js
const context = topDocs.map((d, i) => `[片段 ${i + 1}] ${d.pageContent}`).join("\n");
const prompt = `基于以下内容回答问题：${context}\n\n用户问题：${query}`;
const answer = await llm.invoke(prompt);
```

干净的三条文档，不会超 token，不会带噪声，LLM 回答精准。

---

## 五、核心洞察

### 🔑 Rerank 是"质量守门员"

混合检索负责"找得全"，Rerank 负责"找得准"。

```
ES + Milvus 粗筛 → 几十条 → Rerank 精筛 → 3 条 → LLM
```

没有 Rerank 的 RAG 就像没过滤器的搜索引擎——什么都能搜到，但第一条不一定是想要的。

### 🔑 query-augment 让召回更立体

单条 query 只能从一个角度匹配。LLM 改写 3 条多角度 query，覆盖面翻倍——对同一个用户问题，用不同表述同时搜。

### 🔑 生产级 RAG 的完整链路

```
query-augment → 混合检索(ES + Milvus) → 合并去重 → Rerank → LLM
     ↑                ↑                      ↑        ↑       ↑
  更立体的问法      更全的覆盖            不冗余   更精准  更好的回答
```

---

## 六、代码文件

| 文件 | 做什么 |
|------|--------|
| `src/rag/seed-data.mjs` | 数据写入：同时写 ES 索引和 Milvus 集合 |
| `src/rag/query-augment.mjs` | LLM 改写 query 为 3 条多角度问句 |
| `src/rag/hybrid-retrieval.mjs` | 完整混合检索 + Rerank 流水线 |
| `src/rerank/dashscope-rerank.mjs` | DashScope Rerank API 封装 |
| `src/rerank/test.mjs` | Rerank 模型单独测试 |

## 七、配置要点

```env
# .env
EMBEDDINGS_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDINGS_API_KEY=sk-xxx           # Embedding 和 Rerank 用 DashScope
EMBEDDINGS_MODEL_NAME=text-embedding-v3

RERANK_URL=https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank
RERANK_MODEL=qwen3-rerank

OPENAI_API_KEY=sk-xxx               # Chat 模型用 DeepSeek
OPENAI_BASE_URL=https://api.deepseek.com
MODEL_NAME=deepseek-chat

# 注意：Embedding 和 Rerank 必须走 DashScope（DeepSeek 不支持）
```

## 八、踩坑：query-augment 三步修通

### 8.1 现象

`query-augment.mjs` 生成的 3 条问句完全相同：

```
原始: 家里无线老是断断续续的咋整啊
扩展1: 家里无线老是断断续续的咋整啊
扩展2: 家里无线老是断断续续的咋整啊
扩展3: 家里无线老是断断续续的咋整啊
```

导致 ES 和 Milvus 各用 4 条相同的 query 分别检索——白白浪费了 `4 × 2 = 8` 次检索。

### 8.2 根因链

```
LLM 没真正生成问句
  ↓
三个问题：
① prompt 里 { "queries": ... } 被 LangChain 误解析为模板变量 → 报错 → 走 catch → fallback
② prompt 缺具体示例 → LLM 不理解"不同角度"的含义 → 即使没报错也输出原句
③ withStructuredOutput 默认用 json_schema → DeepSeek 返回 400
④ thinking 模式不支持 function calling → 返回 400
```

### 8.3 修复顺序

| 步 | 改什么 | 为什么 |
|----|--------|--------|
| 1 | `{ "queries" }` → `{{ "queries" }}` | LangChain 模板转义，避免把 JSON 示例当变量 |
| 2 | prompt 里加完整示例（原句 → 三条不同问法） | LLM 需要具体例子才能理解"不同角度" |
| 3 | `.withStructuredOutput(schema, { method: "functionCalling" })` | DeepSeek 不支持 `json_schema`，要用 `functionCalling` |
| 4 | `modelKwargs: { thinking: { type: "disabled" } }` | DeepSeek thinking 模式不支持 function calling |

### 8.4 修复版文件

`examples/es-test/src/rag/query-augment-fix.mjs` — 四步修复后的版本。

### 8.5 如何只在这个场景关 thinking、其他地方保留

别关掉唯一的 ChatOpenAI 实例——**拆两个实例**：

```js
// 实例 A：带 thinking，用于最终生成回答（质量更高）
const chatModel = new ChatOpenAI({
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.2,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  // 不设 modelKwargs，保留 thinking
});

// 实例 B：关 thinking，用于 query-augment（需要 function calling）
const augmentModel = new ChatOpenAI({
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.2,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  modelKwargs: { thinking: { type: "disabled" } },  // ← 只这里关
});

// 用的时候分开传
const graph = compileGraph(esClient, milvus, reranker, {
  chatModel,         // → generate_answer 用
  augmentModel,      // → query_augment 用
});
```

thinking 模型的质量优势在最终回答阶段发挥，query-augment 只需要稳定的 function calling 能力。两个实例各干各的，互不干扰。

---

## 九、完整数据流复盘

### 9.1 运行结果（修复后）

```
原始: 家里无线老是断断续续的咋整啊
扩展1: 路由器频繁掉线如何排查              ← 换术语
扩展2: WiFi信号不稳定有哪些常见原因         ← 换问法
扩展3: 如何排查并解决家庭中的 WIFI 卡顿、掉线问题  ← 换视角
```

三条问句完全不同，覆盖了同一问题的三个角度。

### 9.2 数据流向图

```
用户输入："家里无线老是断断续续的咋整啊"
    │
    ▼ query_augment（augmentModel — 关 thinking）
    生成 3 条多角度问句
    │
    ├───────────────────────┐
    ▼ es_recall（并行）      ▼ milvus_recall（并行）
    3条 × ceil(10/3)=4条    3条 × 4条/次
    去重 → N 条 Document     去重 → M 条 Document
    │                       │
    └──────────┬────────────┘
               ▼ merge（按 id 去重）
               │
               ▼ rerank（qwen3-rerank）
               按原始问题的相关性重新打分
               只保留 Top 3
               │
               ▼ generate_answer（chatModel — 开 thinking）
               把 Top 3 作为 context 传给 LLM
```

### 9.3 三个设计要点

**① 双 Model 实例**

| 实例 | 用途 | thinking | 为什么 |
|------|------|---------|--------|
| `augmentModel` | query_augment | 关 | function calling 需要纯 JSON，thinking 会插入 `<think>` 前缀 |
| `chatModel` | generate_answer | 开 | 最终回答质量更高 |

**② `kEach` 计算**

```js
const kEach = Math.max(3, Math.ceil(ES_K / 3));
// ES_K=10 → ceil(10/3)=4 → Math.max(3,4)=4
```

3 条问句各查 4 条 → 共 12 条原始结果 → 去重后约 8~10 条。`Math.max(3, ...)` 兜底，防止总召回目标太小。

**③ ES 和 Milvus 的互补验证**

用户说"无线断断续续"（口语），笔记写的是"路由器断流排查"（技术词）。ES 关键词匹配不到，Milvus 语义理解精准命中。两者各管一种用户表达习惯——这正是混合检索的价值。

### 9.4 修复版文件

| 文件 | 说明 |
|------|------|
| `src/rag/query-augment-fix.mjs` | 四步修复：转义、示例、functionCalling、关 thinking |
| `src/rag/hybrid-retrieval-fix.mjs` | 双 Model 实例 + 混合检索完整流水线 |
