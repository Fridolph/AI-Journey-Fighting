# LangSmith 全链路观测学习

> 日期：2026-07-29
> 对应示例：`examples/langsmith-test/`
> 参考文档：暂无（本文即学习记录）

---

## 一、LangSmith 是什么，为什么要学它

你之前已经学过 LangGraph——把 Agent 拆成多个节点，数据流转起来。但当问题排查的时候，你只能看到最终输出，**中间每个节点输入了什么、输出了什么、LLM 被调了多少次、Token 花了多少、耗时多少**——完全不可见。

LangSmith 就是来解决这个问题的。

### 一句话定位

| 对比 | LangGraph 解决 | LangSmith 解决 |
|------|---------------|---------------|
| 做什么 | 构建 Agent 工作流 | 观测 Agent 运行 |
| 怎么看 | 看 Mermaid 图（静态） | 看 Trace 树（运行时） |
| 类比 | 你写的 React 组件 | Chrome DevTools Performance 面板 |

**开启只需一行环境变量**，不需要在代码里写任何 LangSmith API 调用：

```bash
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_pt_...
LANGCHAIN_PROJECT=langsmith-test
```

设置了这三行之后，每次 `ragApp.invoke()` 都会自动上报到 LangSmith 云端，你可以在网页上看到每一步的输入/输出/耗时。

---

## 二、项目总览：三个脚本 + 一个语料库

```txt
examples/langsmith-test/
├── .env                     ← LangSmith 追踪 + 模型 + Milvus 配置
├── docker-compose.yml       ← Milvus 本地环境
├── data/                    ← 5 篇售后政策文档（RAG 语料）
│   ├── merbershiop.md       → 会员与积分
│   ├── payment.md           → 支付与发票
│   ├── product_warranty.md  → 产品保修
│   ├── sample.txt           → 退换货政策
│   └── shipping.md          → 配送与物流
└── src/
    ├── milvus_insert.mjs    ← 脚本1：向量化入库
    ├── rag_agent.mjs        ← 脚本2：LangGraph RAG Agent
    └── cli.mjs              ← 脚本3：命令行入口
```

**运行顺序：**

```bash
# 1. 启动 Milvus
docker compose up -d

# 2. 把文档向量化并存入 Milvus
pnpm insert

# 3. 提问测试（同时自动上报到 LangSmith）
pnpm ask "退货要几天？"
```

---

## 三、逐文件解读

### 3.1 `.env` — LangSmith 是怎么接进来的

```bash
# ← 这三行是核心
LANGCHAIN_API_KEY=lsv2_pt_xxxxx  # 从 smith.langchain.com 获取
LANGCHAIN_PROJECT=langsmith-test
LANGCHAIN_TRACING_V2=true
```

**这里有一个重要认知**：

```txt
这个 .env 文件里出现了两套 LangSmith 配置：
  第 41-45 行：LANGCHAIN_PROJECT=learn-ai
  第 53-58 行：LANGCHAIN_PROJECT=langsmith-test

后面那套会覆盖前面那套（dotenv 不覆盖已存在的环境变量？不，
这里是因为 .env 文件里写了两次，后写的 LANGCHAIN_PROJECT 生效）。

实际生效的是：
  LANGCHAIN_PROJECT=langsmith-test  ← 登录 smith.langchain.com 会看到同名项目
```

**LangSmith 追踪不需要你写任何额外的代码。** 它是通过 LangChain 的 callback 机制拦截的——你在代码里定义 LLM、retriever、chain，只要环境变量打开了 `LANGCHAIN_TRACING_V2=true`，LangChain 内部会自动把每次调用的输入/输出/耗时上报。

### 3.2 `data/` — 5 篇售后政策文档

```txt
merbershiop.md    → 会员等级、积分规则、金卡折扣
payment.md        → 支付方式、发票开具（电子发票 24h 内）
product_warranty.md → 手机保修 1 年、安装服务时效
sample.txt        → 无理由退货 7 天内、换货流程
shipping.md       → 满 99 包邮、江浙沪 6 元运费
```

**这 5 个文件加起来就是「客服知识库」的语料。** 后面的 RAG Agent 从这些文档里检索答案。

这些文件都是 Markdown 格式，有 `#` `##` 标题层级，`splitDocuments` 分块时会在语义边界切断（尽量不断在一个标题中间）。

---

### 3.3 `milvus_insert.mjs` — 向量化入库脚本

**这个脚本只跑一次：把 data/ 里的文档 → 切块 → 向量化 → 存入 Milvus**

#### 逐段解析

```js
// 第 1-6 行：引入依赖
// dotenv      — 读 .env 配置
// fs          — 读本地文件
// MilvusClient — Milvus SDK
// TextSplitter — LangChain 文本切块
// OpenAIEmbeddings — 向量化（底层复用 OpenAI 兼容 API）
```

```js
// 第 12-16 行：初始化 Embedding 模型
const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,     // DeepSeek 的 key
  model: "text-embedding-v3",             // 但实际走的是千问的 text-embedding-v3
  configuration: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  },
});
```

> ⚠️ **这里有个容易踩的坑**：`openaiApiKey` 和 `configuration.baseURL` 虽然配置的是 DeepSeek 的 key，但 `model` 是 `text-embedding-v3`（千问的向量模型），实际请求会发到 `.env` 里的 `OPENAI_BASE_URL`。**Chat 模型和 Embedding 模型可以是不同厂商的**——只要 API 兼容 OpenAI 格式。

```js
// 第 20-39 行：loadChunks() — 读文件 → 切块
async function loadChunks(dataDir = "./data") {
  // 1. 读 data/ 下所有 .txt .md 文件
  const files = readdirSync(dataDir).filter(f => /\.(txt|md)$/i.test(f));
  // 2. 每个文件变成一个 Document 对象 { pageContent, metadata: { source } }
  const docs = files.map(f => ({
    pageContent: readFileSync(join(dataDir, f), "utf-8"),
    metadata: { source: f },      // ← 记录来源文件，检索时可以看到引用
  }));
  // 3. 按 500 字符切块，块与块之间重叠 50 字符
  //    重叠的目的是：防止一句话刚好被切断在块边界上
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });
  return splitter.splitDocuments(docs);
}
```

**切块前后对比：**

```
原始文档（shipping.md，约 1500 字）
  → RecursiveCharacterTextSplitter(chunkSize=500, overlap=50)
  → 约 4-5 个 chunk，每个 chunk 的最后 50 字和下一个 chunk 的前 50 字相同

为什么 overlap=50？
  用户问题"江浙沪运费多少"——答案可能横跨两个 chunk 的边界
  overlap 保证边界处的信息至少出现在一个完整的 chunk 里
```

```js
// 第 41-109 行：main() — 建 Collection + 写入向量

// ① 如果同名 Collection 已存在，先删掉（幂等重建）
if (await client.hasCollection({ collection_name: COLLECTION })).value) {
  await client.dropCollection({ collection_name: COLLECTION });
}

// ② 批量向量化（一次 API 调用处理所有 chunk，比逐条调快 N 倍）
const vectors = await embeddings.embedDocuments(
  chunks.map(c => c.pageContent)
);

// ③ 建 Collection，字段名用 langchain_ 前缀（LangChain 约定）
//    langchain_primaryid  → 自增主键
//    langchain_vector      → 向量字段（维度由 embedding 模型决定）
//    langchain_text        → 原始文本
//    source                → 来源文件名
```

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `langchain_primaryid` | Int64, 自增主键 | LangChain 内部约定 |
| `langchain_vector` | FloatVector | 向量维度由模型决定 |
| `langchain_text` | VarChar(8000) | 切块后的文本 |
| `source` | VarChar(256) | 来自哪个文件 |

```js
// ④ 建索引 — IVF_FLAT + L2 距离
await client.createIndex({
  field_name: "langchain_vector",
  index_type: IndexType.IVF_FLAT,
  metric_type: MetricType.L2,
  params: { nlist: 128 },
});

// ⑤ 加载到内存才能搜
await client.loadCollection({ collection_name: COLLECTION });
```

> `IVF_FLAT` 是你之前学过的——先聚类（nlist=128 个簇），搜索时只在最近的几个簇里找，速度比暴力扫描快很多，适合数据量不大的场景。`L2` 是欧几里得距离。

---

### 3.4 `rag_agent.mjs` — LangGraph RAG Agent

**这是整个项目的核心——两节点 LangGraph 工作流，每次运行自动上报到 LangSmith**

#### 架构图

```
用户问题
    │
    ▼
┌─────────┐
│ retrieve │  ← Milvus 向量检索，返回 Top 4 相关文档片段
└────┬────┘
     │ context
     ▼
┌─────────┐
│ generate │  ← LLM 根据 context + question 生成回答
└────┬────┘
     │ answer
     ▼
  返回给用户
```

#### 逐段解析

```js
// 第 9-13 行：Embedding 模型
// 必须和 milvus_insert.mjs 用同一个模型，否则向量空间不一致
const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  model: process.env.EMBEDDING_MODEL ?? "text-embedding-v3",
});
```

> ⚠️ **向量模型不一致 = 搜出来是垃圾。** 写入用的什么模型，查询必须用什么模型。

```js
// 第 15-20 行：Chat 模型（temperature=0 → 确定性输出）
const llm = new ChatOpenAI({
  model: "deepseek-v4-flash",
  temperature: 0,        // ← RAG 场景必须用 0，不能发挥创意
});
```

```js
// 第 22-27 行：从已有 Collection 创建向量存储 + 检索器
const vectorStore = await Milvus.fromExistingCollection(embeddings, {
  collectionName: "rag_docs",
  url: "http://localhost:19530",
});

const retriever = vectorStore.asRetriever({ k: 4 });
// k: 4 → 每次检索返回最相关的 4 个文档片段
```

`fromExistingCollection` 对比你之前学过的 `createCollection`：

| 方法 | 什么时候用 |
|------|-----------|
| `createCollection` | 第一次建库，写 Schema + 数据 |
| `fromExistingCollection` | 库已经存在，直接连上去读（rag_agent 就是这种） |

```js
// 第 29-37 行：Prompt + Chain
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "你是客服助手。仅根据下面「上下文」回答；上下文没有的信息请明确说不知道，不要编造。\n\n上下文：\n{context}"],
  ["human", "{question}"],
]);

// RunnableSequence = 管道式串联
const chain = RunnableSequence.from([prompt, llm, new StringOutputParser()]);
// prompt → llm → StringOutputParser（AI Message 对象 → 纯字符串）
```

**Prompt 设计的关键约束：**

```txt
"不要编造"      → 防止 LLM 从训练数据里补充知识（上下文里没有就说不知道）
"根据下面「上下文」" → 约束 LLM 只用检索结果回答

例子：
  Q: "紧急问题怎么联系客服？"
  检索结果有空 → LLM 回答"未查询到相关信息"
  检索结果有 → LLM 基于检索结果回答
```

```js
// 第 39-57 行：LangGraph State + 两个节点
const GraphState = Annotation.Root({
  question: Annotation,   // 用户问题
  context: Annotation,    // 检索结果
  answer: Annotation,     // 最终回答
});

// 节点1: 检索
async function retrieve(state) {
  const docs = await retriever.invoke(state.question);
  return { context: docs };   // ← 写入 state.context
}

// 节点2: 生成
async function generate(state) {
  const contextText = state.context.map(d => d.pageContent).join("\n\n");
    // ↑ 把 4 个文档片段拼成一段长文本
  const answer = await chain.invoke({ context: contextText, question: state.question });
  return { answer };         // ← 写入 state.answer
}
```

**State 的数据流向：**

```
用户调用 ask("退货要几天？")
  → state.question = "退货要几天？"

retrieve(state) 执行：
  → retriever.invoke("退货要几天？") → [doc1, doc2, doc3, doc4]
  → return { context: [doc1, doc2, doc3, doc4] }
  → state.context 更新

generate(state) 执行：
  → 读 state.context → 拼成文本
  → chain.invoke({ context: "…", question: "退货要几天？" })
  → return { answer: "根据我们的退换货政策，无理由退货要在收到商品后 7 天内申请..." }

最终返回 { answer: "…", context: [...] }
```

```js
// 第 59-64 行：工作流编排
const workflow = new StateGraph(GraphState)
  .addNode("retrieve", retrieve)
  .addNode("generate", generate)
  .addEdge(START, "retrieve")
  .addEdge("retrieve", "generate")
  .addEdge("generate", END);

export const ragApp = workflow.compile();
```

**LangSmith 视角：**

当这个工作流运行时，LangSmith 会自动捕获：
- `retrieve` 节点的输入（question）、输出（4 个文档的 metadata + pageContent）、耗时
- `generate` 节点的输入（context + question）、输出（answer）、LLM 调用次数、Token 消耗
- 完整的 Trace 树，可以展开看每一步的细节

---

### 3.5 `cli.mjs` — 命令行入口

```js
// 默认问题列表（6 个客服场景）
const DEFAULT_QUESTIONS = [
  "无理由退货要在几天内？",
  "满多少元包邮？",
  "金卡会员有什么折扣？",
  "电子发票多久能开好？",
  "手机保修多久？",
  "紧急问题怎么联系客服？",
];

// 支持两种用法：
//   pnpm ask                          → 跑全部 6 个默认问题
//   pnpm ask "退货要几天？"           → 只跑你输入的问题

const args = process.argv.slice(2);
const questions = args.length > 0 ? [args.join(" ")] : DEFAULT_QUESTIONS;
```

```js
// 逐问题执行，打印答案 + 引用来源
for (const question of questions) {
  const { answer, context } = await ask(question);
  console.log(`答: ${answer}`);
  printContext(context);   // 打印检索到的文档来源 + 内容预览
}
```

**运行效果示例：**

```
问题 1: 无理由退货要在几天内？
答: 根据退换货政策，无理由退货需要在收到商品后 7 天内申请。

引用片段:
  [1] sample.txt
      退换货政策 7天无理由退货 自收到商品之日起7天内，商品不影响二次销售的前提下...
```

---

## 四、LangSmith 全链路观测是怎么工作的

### 4.1 不需要你写代码

你在 langsmith-test 的三个脚本里，**一句 `langsmith` 的代码都没写**。那它是怎么追踪的？

```txt
LangSmith 的追踪是基于 LangChain 内部的 Callback 机制：

  1. 环境变量 LANGCHAIN_TRACING_V2=true 被 dotenv 读入
  2. LangChain 内部检测到这个变量后，自动注册 LangSmithTracer callback
  3. 每次 LLM 调用、Chain 调用、Retriever 调用时，callback 会被触发
  4. callback 把输入/输出/耗时/Token数 序列化后 POST 到 LangSmith API
```

**类比你已经熟悉的**：就像 `console.log` 不需要你手动实现，LangSmith 追踪是 LangChain 内置的。

### 4.2 package.json 里的 langsmith 依赖

```json
"langsmith": "^0.3.12",
"openevals": "^0.2.0"    // ← LangSmith 的评估库，下一步会用到
```

`langsmith` 包做的事：
- 管理 Trace 的上报（Client SDK）
- `LANGCHAIN_TRACING_V2=true` 时自动激活
- `openevals` 提供自动化评估工具（正确性、相关性打分等）

### 4.3 上 smith.langchain.com 能看到什么

登录后进入项目 `langsmith-test`，每次运行 `pnpm ask` 都会生成一条 Trace：

```
Trace 树结构：
  ├─ RAG Agent (总 Trace)
  │   ├─ retrieve (节点1)
  │   │   ├─ Milvus.search → 耗时 45ms
  │   │   └─ 输出: 4 个文档片段
  │   └─ generate (节点2)
  │       ├─ ChatOpenAI.invoke → 耗时 1200ms, Token: 180→85
  │       └─ 输出: "根据退换货政策..."
```

**每个节点可以点开看细节：**

| 看什么 | 在哪看 |
|--------|--------|
| LLM 每次调用的输入/输出 | generate → LLM |
| Token 消耗（输入多少、输出多少） | generate → LLM → Usage |
| 检索耗时 | retrieve → Latency |
| 链条完整调用顺序 | Tree 视图 |

---

## 五、LangSmith Evaluation：三步走

有了观测（Tracing）还不够——每次改 Prompt、换模型、调 chunkSize 后，你得知道效果是变好了还是变坏了。Evaluation 就是做这件事的。

Evaluation 分三步：

```txt
Step 1: build_dataset.mjs → 把「问题 + 标准答案」上传到 LangSmith
Step 2: evaluators.mjs     → 定义三个评分维度（忠实度/有用性/检索相关性）
Step 3: run_eval.mjs       → 用测试集跑 Agent，LangSmith 自动打分
```

---

### 5.1 `build_dataset.mjs` — 建测试集

**这个脚本只跑一次**：把 12 条「问题 + 标准答案」上传到 LangSmith Dataset。

```js
const DATASET_NAME = "rag-eval-v1";

const EXAMPLES = [
  {
    inputs:  { question: "无理由退货要在几天内申请？" },
    outputs: { answer: "自签收之日起 7 天内支持无理由退货。" },
  },
  {
    inputs:  { question: "满多少元包邮？" },
    outputs: { answer: "满 99 元包邮（部分大件/冷链除外）。" },
  },
  // ... 共 12 条
];
```

**每条样例的结构：**

```txt
inputs.question   → 用户会问的问题
outputs.answer    → 期望的标准答案（来自数据文档的原文）
```

```js
// 核心逻辑：创建/复用 Dataset，然后批量上传样例
async function main() {
  const client = new Client({ apiKey: process.env.LANGCHAIN_API_KEY });

  // 如果 Dataset 已经存在就复用，不存在就创建
  let dataset;
  try {
    dataset = await client.readDataset({ datasetName: DATASET_NAME });
    console.log(`数据集已存在: ${DATASET_NAME}`);
  } catch {
    dataset = await client.createDataset(DATASET_NAME, {
      description: "RAG Agent 回归评估集",
    });
  }

  // 批量创建 12 条样例
  const created = await client.createExamples(
    EXAMPLES.map(e => ({
      dataset_id: dataset.id,
      inputs: e.inputs,
      outputs: e.outputs,
    }))
  );
}
```

**运行**：`pnpm eval:dataset`

**运行后去 smith.langchain.com → Datasets → rag-eval-v1 能看到 12 条测试样例。**

---

### 5.2 `evaluators.mjs` — 三个评分维度

**这个文件本身不运行**，它只是定义了三个「评委」——每个评委用 LLM 对 Agent 的输出打分。

```js
import { createLLMAsJudge, RAG_GROUNDEDNESS_PROMPT,
         RAG_HELPFULNESS_PROMPT, RAG_RETRIEVAL_RELEVANCE_PROMPT } from "openevals";
```

`createLLMAsJudge` 是 openevals 的核心 API：**用一个 LLM 来评判另一个 LLM 的输出。**

#### 三个评分维度

| 维度 | 英文 | 评什么 | 什么算低分 | 什么算高分 |
|------|------|--------|-----------|-----------|
| **忠实度** | groundedness | 回答的内容是否都来自检索上下文？有没有幻觉？ | "周一至周五 9:00-18:00" 但文档里没写 | 每句话都能在检索结果里找到来源 |
| **有用性** | helpfulness | 回答是否直接回应了用户问题？是否切题？ | 问"退货几天"，回答"我们支持微信支付" | 直接回答退货天数 |
| **检索相关性** | retrieval_relevance | 召回的文档片段和问题相关吗？ | 问"包邮"，检索结果全是保修条款 | 问"包邮"，检索结果都是运费/配送相关 |

#### 逐段解析

```js
// ① 每个评委都是用 LLM 当裁判
const judge = new ChatOpenAI({
  model: "deepseek-v4-flash",
  temperature: 0,    // 评分必须确定，不能随机
});

// ② createLLMAsJudge 的三个参数：
//    prompt    → 评分标准（openevals 内置，不需要自己写）
//    feedbackKey → 在 LangSmith 上显示的指标名称
//    judge     → 用哪个 LLM 来打分
//    continuous → true = 返回 0~1 的连续分数，false = 返回 True/False

// 忠实度：答案是否被上下文支撑
const ragGroundednessJudge = createLLMAsJudge({
  prompt: RAG_GROUNDEDNESS_PROMPT,
  feedbackKey: "rag_groundedness",
  judge,
  continuous: true,   // ← 返回 0~1 分数，不是二分类
});

// 有用性：是否答对了
const ragHelpfulnessJudge = createLLMAsJudge({
  prompt: RAG_HELPFULNESS_PROMPT,
  feedbackKey: "rag_helpfulness",
  judge,
  continuous: true,
});

// 检索相关性：召回片段是否相关
const ragRetrievalRelevanceJudge = createLLMAsJudge({
  prompt: RAG_RETRIEVAL_RELEVANCE_PROMPT,
  feedbackKey: "rag_retrieval_relevance",
  judge,
  continuous: true,
});
```

```js
// ③ 用 Evaluator 函数包装 Judge
// Evaluator 函数从 run_eval 接收 { inputs, outputs }，
// 再喂给 Judge 打分

export async function ragGroundednessEvaluator({ outputs }) {
  return ragGroundednessJudge({
    context: { documents: outputs.context },  // 检索到的文档
    outputs: { answer: outputs.answer },      // LLM 的回答
  });
}

export async function ragHelpfulnessEvaluator({ inputs, outputs }) {
  return ragHelpfulnessJudge({
    inputs,                                   // 用户问题
    outputs: { answer: outputs.answer },      // LLM 的回答
  });
}

export async function ragRetrievalRelevanceEvaluator({ inputs, outputs }) {
  return ragRetrievalRelevanceJudge({
    inputs,                                   // 用户问题
    context: { documents: outputs.context },  // 检索到的文档
  });
}

// ④ 三个 Evaluator 打包导出
export const ragEvaluators = [
  ragGroundednessEvaluator,
  ragHelpfulnessEvaluator,
  ragRetrievalRelevanceEvaluator,
];
```

**三个 Evaluator 分别需要什么参数：**

| Evaluator | 需要 inputs | 需要 outputs.answer | 需要 outputs.context |
|-----------|:--:|:--:|:--:|
| groundedness | | ✅ | ✅ |
| helpfulness | ✅ | ✅ | |
| retrieval_relevance | ✅ | | ✅ |

为什么 groundedness 不需要 inputs？因为它只关心「回答有没有被上下文支撑」，不关心问题本身。

---

### 5.3 `run_eval.mjs` — 跑评测

**这个脚本是真正的执行入口**：用 12 条测试样例逐个调用 Agent，每条都经过三个评委打分。

```js
import { evaluate } from "langsmith/evaluation";
import { ask } from "../rag_agent.mjs";     // ← 你之前的 RAG Agent
import { ragEvaluators } from "./evaluators.mjs";
```

#### ① 包装 Agent 为评测函数

```js
async function runRagAgent(inputs) {
  // inputs = { question: "无理由退货要在几天内申请？" }
  const { answer, context } = await ask(inputs.question);

  return {
    answer,
    context: context.map(d => d.pageContent),  // ← 返回纯文本，不返回 metadata
  };
}
```

```txt
evaluate() 对每一条测试样例：
  ① 取出 inputs.question
  ② 调用 runRagAgent(inputs) → 拿到 { answer, context }
  ③ 把 { inputs, outputs: {answer, context} } 传给三个 ragsEvaluators
  ④ 每个 Evaluator 内部调 LLM 打分
  ⑤ 记录分数到 LangSmith
```

#### ② 核心评测调用

```js
const result = await evaluate(runRagAgent, {
  data: DATASET_NAME,        // ← 用 build_dataset 建的测试集
  evaluators: ragEvaluators,  // ← 三个评分维度
  client,
  experimentPrefix: `rag-openevals-${process.env.MODEL_NAME}`,
  maxConcurrency: 2,          // 最多同时跑 2 条，防止 LLM API 限流
});

// evaluate() 返回 AsyncGenerator，需要 drain 才能触发全部执行
for await (const _row of result) {
  /* drain */
}
```

> ⚠️ `evaluate()` 返回的是一个 **AsyncGenerator**，不会自动执行全部样例。你必须 `for await` 遍历它（或者 `.toArray()`），否则只跑第一条就停了。

#### ③ 完整评测数据流

```
① build_dataset 上传 12 条样例到 LangSmith Dataset
     │
     ▼
② run_eval 逐个运行：
     │
     ├─ 对每条样例：
     │    ├─ ask(question) → LangGraph (retrieve → generate) → answer + context
     │    ├─ LangSmith 自动记录这条 Trace（观测）
     │    ├─ groundednessEvaluator({outputs})    → LLM 打分 0~1
     │    ├─ helpfulnessEvaluator({inputs, outputs}) → LLM 打分 0~1
     │    └─ retrievalRelevanceEvaluator({inputs, outputs}) → LLM 打分 0~1
     │
     ▼
③ LangSmith Web 看到：
   - 每条样例的三个分数
   - 12 条样例的均分
   - 和历史实验的对比
```

---

### 5.4 三个脚本的关系

| 脚本 | 跑几次 | 做什么 | 依赖 |
|------|--------|--------|------|
| `build_dataset.mjs` | 一次 | 上传测试样例到 LangSmith | `langsmith.Client` |
| `evaluators.mjs` | 不直接跑 | 定义评分维度（被 run_eval 引用） | `openevals` |
| `run_eval.mjs` | 每次改代码后跑一次 | 用测试集跑 Agent + 自动打分 | 上面两个 + `rag_agent` |

**典型工作流**：

```bash
# 第一步：建测试集（一次性）
pnpm eval:dataset

# 每次改了 Agent 代码后：
# 第二步：跑评测
pnpm eval:run

# 第三步：去 smith.langchain.com 看结果
# → 对比上次实验，三个指标哪个涨了哪个跌了
```

---

### 5.5 为什么需要 Evaluation（对比你已有的学习经验）

你之前学 ES 和 Neo4j 时，验证质量的唯一方法是"肉眼看看输出对不对"——跑几个问题，人工判断。这在实验阶段够了，但有两个问题：

```txt
问题 1：改了一行 Prompt，到底有没有变好？
  "只能凭感觉，说不出具体数据"

问题 2：信心盲区
  "之前问的 3 个问题都对，但第 4 个悄悄坏了，你不知道"
  → 这就是 Neo4j 那章你遇到的「台式 vs 台式奶茶」问题本质
  → 如果有回归测试集，改完代码跑一遍就能发现
```

**LangSmith Evaluation 就是把"人工抽查"变成"自动化回归测试"。**

类比你已经熟悉的：

| 前端 | AI Agent |
|------|----------|
| Jest 单元测试 | LangSmith Evaluation |
| `expect(add(1,2)).toBe(3)` | `expect(groundedness).toBeGreaterThan(0.8)` |
| CI 跑全量测试 | `pnpm eval:run` 跑全量样例 |

---

## 六、本章学到的东西

| 概念 | 一句话 |
|------|--------|
| **LangSmith 全链路观测** | 像 Chrome DevTools 看前端性能一样，看 Agent 每一步的输入/输出/耗时/Token |
| **开启方式** | 三行环境变量，零代码侵入 |
| **向量入库** | 读文件 → 切块(500字, 重叠50) → Embedding → Milvus |
| **RAG Agent 工作流** | LangGraph 两节点：retrieve (Milvus Top4) → generate (LLM 回答) |
| **Prompt 约束** | "不要编造" + "只根据上下文回答" → 防止 LLM 幻觉 |
| **向量模型一致性** | 写入和查询必须用同一个 Embedding 模型 |
| **测试集 (Dataset)** | 12 条「问题 + 标准答案」，上传到 LangSmith 作为回归测试 |
| **LLM-as-Judge** | 用一个 LLM 给另一个 LLM 的输出打分（0~1 连续分） |
| **三个评分维度** | groundedness（有没有幻觉）、helpfulness（有没有答偏）、retrieval_relevance（召回有没有跑偏） |
| **evaluate()** | 一键跑全量测试集 + 自动打分，返回 AsyncGenerator 必须 drain |
| **前端类比** | LangSmith Evaluation = Jest 单元测试，只是评委是 LLM 而不是 `expect()` |

---

*昇哥 · 2026年7月*
