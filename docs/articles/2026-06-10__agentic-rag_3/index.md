---
title: "前端转全栈：混合检索 RAG — 多路召回 + Rerank 重排 + Agentic RAG 一次搞懂"
published: 2026-07-01
tags: [ElasticSearch, Milvus, RAG, Rerank, Agentic RAG, 混合检索, 前端转全栈]
category: 后端
---

> 上两篇把 ES 的基础概念和 CRUD 操作跑通了。这篇往上走一层——把 ES 和 Milvus 真正串起来，实现一个生产级的混合检索 RAG 系统，同时引入 Agentic RAG 的概念，看清楚这套架构的天花板在哪里。

---

## 读这篇，你可以带走什么

| # | 你会学到 | 对应内容 |
|---|---------|---------|
| 1 | 混合检索之后为什么还需要 Rerank | 召回 vs 精排的分工 |
| 2 | Rerank 模型和 Embedding 模型的本质区别 | Cross-Encoder vs Bi-Encoder |
| 3 | Query Augment 是什么，为什么能提升召回质量 | 多角度改写 |
| 4 | 生产级 RAG 的完整流水线 | 6 路检索 → 合并 → 精排 → LLM |
| 5 | Agentic RAG 是什么，和传统 RAG 的本质区别 | LLM 主动决策 |

---

## 一、先回顾：混合检索解决了什么

上篇我们跑通了 ES + Milvus 混合检索：

- **ES 词条检索**：精确匹配关键词、术语、编号，不会漂移
- **Milvus 语义检索**：捕捉语义相似性，同义词、近义词都能召回

两路并行，互补覆盖，召回质量显著高于单路检索。

但混合检索解决了"找得全"，同时带来了一个新问题。

---

## 二、混合检索之后为什么还需要 Rerank

两路各召回 20 条，合并去重后可能有 30-40 条候选文档。

**直接把这 40 条塞给 LLM 会发生什么：**

| 问题 | 原因 |
|------|------|
| **上下文超限** | LLM 的 token 窗口有限，40 条文档塞不下 |
| **噪声干扰** | 不相关的文档越多，LLM 越容易答非所问 |
| **幻觉增加** | 信息量太大，LLM 分不清哪个是真正的依据 |
| **成本飙升** | token 越多，API 费用越高 |

所以混合检索之后必须加一步：**Rerank——从 40 条里精筛出最相关的 3-5 条**，再交给 LLM。

```
ES + Milvus 粗筛 → 30-40 条 → Rerank 精筛 → 3-5 条 → LLM
     "找得全"                      "找得准"
```

没有 Rerank 的 RAG，就像没有过滤器的搜索引擎——什么都能搜到，但第一条不一定是你想要的。

---

## 三、Rerank 模型是什么

### 3.1 和 Embedding 模型的本质区别

理解 Rerank，先要理解它和 Embedding 模型的区别：

| | Embedding 模型（Bi-Encoder） | Rerank 模型（Cross-Encoder） |
|--|---------------------------|---------------------------|
| **输入** | 一段文本 | 一个问题 + 一段文档（拼在一起） |
| **输出** | 向量（浮点数组） | 一个相关度分数（0-1） |
| **做什么** | 把文本转成向量，用于相似度计算 | 直接给「问题-文档对」打相关性分 |
| **速度** | 快（可以预计算） | 慢（每对都要推理一次） |
| **精度** | 中等（分别编码，再比较） | 高（同时看到问题和文档全文） |
| **适合阶段** | 初始召回（粗筛） | 最终精排（精筛） |

**为什么 Cross-Encoder 更准确？**

Embedding 模型是**双塔结构**：问题和文档分别编码成向量，再算余弦相似度。两者编码时互相看不到对方，信息是割裂的。

Rerank 模型是**交叉编码**：把问题和文档拼在一起输入，模型能同时看到两者的完整内容，理解它们之间的具体关联，打出更精准的分数。

**代价是速度慢**——所以只用在最后的精排阶段，对少量候选文档做精排。如果用在初始召回阶段，每条文档都要推理一次，延迟会爆炸。

### 3.2 代码调用

```js
// dashscope-rerank.mjs — 封装 DashScope Rerank API
const res = await fetch(process.env.RERANK_URL, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'qwen3-rerank',
    input: {
      query,                                      // 用户原始问题
      documents: documents.map(d => d.pageContent), // 待评估的文档列表
    },
    parameters: { top_n: 3 },                     // 只返回前 3 篇
  }),
});

// 返回结果：每条文档的 relevance_score，已按分数降序排列
// [{ index: 2, relevance_score: 0.95 }, { index: 0, relevance_score: 0.87 }, ...]
```

输入一个问题 + 一堆文档，输出每条文档的相关度分数，按分数排序取 top_n。

---

## 四、Query Augment — 让召回更立体

在混合检索之前，还有一步经常被忽视但非常重要的操作：**Query Augment（问题改写）**。

### 4.1 为什么需要改写

用户的原始问题往往口语化、角度单一：

```
原始问题："杭州西湖有什么好玩的"
```

这条问题走 ES 词条检索，可能只命中包含"杭州西湖"和"好玩"的文档。
走 Milvus 语义检索，也只从这一个角度搜索。

但知识库里的文档可能是这样写的：
- "西湖十景游览攻略"（没有"好玩"这个词）
- "杭州周末休闲活动推荐"（没有"西湖"这个词）
- "断桥残雪、雷峰夕照必去景点"（完全不同的表述）

单条问题，召回覆盖面有限。

### 4.2 LLM 改写多角度问句

```js
// query-augment.mjs
async function augmentQuery(originalQuery) {
  const response = await llm.invoke(`
    将以下问题改写成 3 个不同角度的搜索词，用于检索知识库。
    要求：角度不同，表述不同，但语义相关。
    只返回 JSON 数组，不要其他内容。

    原始问题：${originalQuery}
    格式：["改写1", "改写2", "改写3"]
  `);

  return JSON.parse(response.content);
}

// 改写结果示例：
// 原始："杭州西湖有什么好玩的"
// 改写：[
//   "杭州西湖有哪些著名的旅游景点和游览项目",
//   "杭州西湖周边有什么值得推荐的休闲活动",
//   "杭州西湖游玩攻略与必去目的地"
// ]
```

3 条不同角度的问句，每条分别走 ES 和 Milvus，相当于 **3 × 2 = 6 路检索**。

覆盖面翻倍，召回质量显著提升。

---

## 五、生产级 RAG 的完整流水线

把 Query Augment + 混合检索 + Rerank 串起来，就是生产级 RAG 的完整通路：

```
用户输入："杭州西湖有什么好玩的"
         │
         ▼
┌─────────────────────────────────────────────┐
│  Step 1: Query Augment                      │
│  LLM 改写 → 3 个角度的问句                   │
│  q1: "杭州西湖著名旅游景点和游览项目"          │
│  q2: "杭州西湖周边休闲活动推荐"               │
│  q3: "杭州西湖游玩攻略必去目的地"             │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  Step 2: 6 路并行检索                        │
│                                             │
│  q1 → ES 词条检索  → hits_es_1              │
│  q1 → Milvus 语义  → hits_milvus_1          │
│  q2 → ES 词条检索  → hits_es_2              │
│  q2 → Milvus 语义  → hits_milvus_2          │
│  q3 → ES 词条检索  → hits_es_3              │
│  q3 → Milvus 语义  → hits_milvus_3          │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  Step 3: 合并去重                            │
│  同 ID 保留更高分数                           │
│  合并后约 20-40 条候选文档                    │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  Step 4: Rerank 精排                        │
│  Cross-Encoder 对每条文档打相关性分            │
│  取 Top 3，丢弃其余                          │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  Step 5: 拼 Prompt → LLM 流式回答            │
│  3 条精准文档 + 用户原始问题                  │
│  不超 token，不带噪声                         │
└─────────────────────────────────────────────┘
```

### 5.1 合并去重的代码

```js
function mergeUnique(existingDocs, newDocs) {
  const map = new Map();

  for (const doc of [...existingDocs, ...newDocs]) {
    const key = String(doc.id);
    const prev = map.get(key);
    // 同 ID 的文档可能被多路检索命中，保留分数更高的那份
    if (!prev || doc.score > prev.score) {
      map.set(key, doc);
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.score - a.score);
}
```

### 5.2 Rerank 精排的代码

```js
// 使用 LangChain 的 compressDocuments 接口
const compressor = new DashScopeRerank({ apiKey, topN: 3 });
const topDocs = await compressor.compressDocuments(mergedDocs, query);

// topDocs 是按相关性降序排列的 3 条文档
```

### 5.3 拼 Prompt，LLM 作答

```js
const context = topDocs
  .map((doc, i) => `[片段 ${i + 1}]\n${doc.pageContent}`)
  .join('\n\n');

const prompt = `你是一个知识助手。请基于以下检索到的资料回答用户问题。
如果资料中没有相关信息，请直接说"我没有找到相关信息"，不要编造。

参考资料：
${context}

用户问题：${query}`;

const answer = await llm.stream(prompt);
```

**"不要编造"这句话很重要。** 没有这个约束，LLM 在检索结果不够好时仍然会幻觉。RAG 的核心价值之一就是让 LLM 基于真实资料作答，而不是凭记忆生成。

### 5.4 每个环节的价值

```
Query Augment → 混合检索(ES + Milvus) → 合并去重 → Rerank → LLM
     ↑                  ↑                   ↑         ↑       ↑
  更立体的问法        更全的覆盖           不冗余    更精准  更好的回答
```

---

## 六、环境配置要点

```env
# .env

# Embedding 模型（必须走 DashScope，DeepSeek 不支持）
EMBEDDINGS_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDINGS_API_KEY=sk-xxx
EMBEDDINGS_MODEL_NAME=text-embedding-v3

# Rerank 模型（必须走 DashScope）
RERANK_URL=https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank
RERANK_MODEL=qwen3-rerank

# Chat 模型（可以用 DeepSeek，便宜）
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.deepseek.com
MODEL_NAME=deepseek-chat
```

**一个容易踩的坑：** Embedding 和 Rerank 必须走 DashScope，DeepSeek 不支持这两个功能。如果 `seed-data.mjs` 里的 Embedding 用的是 `OPENAI_API_KEY`，需要改成 `EMBEDDINGS_API_KEY`，否则写入向量库会失败。

---

## 七、从这里到 Agentic RAG

跑完上面这套流水线，你会发现它已经很强了——但它有一个根本性的局限：

**整个流程是线性的、固定的、一次性的。**

```
用户问 → 改写 → 检索 → 精排 → 回答
```

没有判断，没有分支，没有"如果检索结果不够好怎么办"。

### 7.1 三个无法解决的问题

**问题 1：检索一次不够用**

用户问："帮我对比 ES 和 Milvus 在 RAG 场景下的优缺点，并给出选型建议"

这个问题实际上需要：
- 检索 ES 的相关资料
- 检索 Milvus 的相关资料
- 检索"RAG 选型"的相关资料
- 综合三路结果才能回答

固定的一次检索，覆盖不全。

**问题 2：不知道检索结果够不够好**

检索完了，系统不会判断"这 3 条文档够不够回答这个问题"。够不够都往下走，资料不足时 LLM 开始幻觉。

**问题 3：无法使用知识库之外的工具**

用户问："今天杭州的天气怎么样，适合去西湖跑步吗？"

知识库里没有实时天气数据。传统 RAG 检索不到，只能说"我不知道"或者编造。

### 7.2 Agentic RAG：给 RAG 加上"大脑"

**Agentic RAG** 的核心思路是：

> 不再让 RAG 走固定流程，而是让 LLM 作为一个 **Agent（智能体）** 来主动决策——决定要不要检索、检索什么、检索几次、用什么工具、什么时候停止。

```
传统 RAG：固定流水线
用户问 → 检索 → 精排 → 回答（线性，一次性）

Agentic RAG：LLM 主动决策
用户问 → LLM 思考 → 决定用什么工具 → 执行 → 判断够不够 → 继续或停止
                                                    ↑_____________|
                                                        循环
```

### 7.3 ReAct：最主流的 Agentic RAG 模式

**ReAct（Reasoning + Acting）** 是目前最主流的实现方式，也是 LangChain Agent 的默认模式。

核心是一个 **Thought → Action → Observation** 的循环：

```
Thought（思考）：我需要什么信息来回答这个问题？
   ↓
Action（行动）：调用工具 X，参数是 Y
   ↓
Observation（观察）：工具返回了什么结果？
   ↓
Thought（再思考）：这些信息够了吗？还缺什么？
   ↓
Action（再行动）：调用工具 Z，参数是 W
   ↓
（循环，直到 LLM 认为信息足够）
   ↓
Final Answer（最终回答）
```

用一个具体例子感受一下：

> 用户问："ES 的 BM25 和 Milvus 的余弦相似度，哪个更适合搜索技术文档？"

```
Thought: 我需要了解 BM25 的特点和适用场景
Action: hybrid_search("BM25 算法特点 适用场景")
Observation: [返回 3 条关于 BM25 的文档]

Thought: 我还需要了解余弦相似度在向量检索中的特点
Action: hybrid_search("余弦相似度 向量检索 特点")
Observation: [返回 3 条关于向量检索的文档]

Thought: 我需要找一些技术文档检索的选型建议
Action: hybrid_search("技术文档检索 ES Milvus 选型")
Observation: [返回 2 条相关文档]

Thought: 信息足够了，可以综合回答
Final Answer: 对于技术文档搜索，建议混合使用两者...
```

注意：**这里的 `hybrid_search` 就是我们今天实现的混合检索流水线**——它在 Agentic RAG 里是一个工具（Tool），被 Agent 按需调用。

### 7.4 Agentic RAG 的工具箱

Agent 不只有混合检索这一个工具，它可以按需调用任何工具：

```
Agent（LLM 大脑）
   │
   ├─ 工具 1：hybrid_search（ES + Milvus 混合检索）← 今天实现的
   ├─ 工具 2：web_search（实时网络搜索）
   ├─ 工具 3：calculator（数学计算）
   ├─ 工具 4：code_executor（代码执行）
   ├─ 工具 5：database_query（数据库查询）
   └─ 工具 6：weather_api（实时天气）
```

用户问天气 → Agent 调 `weather_api`
用户问知识库里的内容 → Agent 调 `hybrid_search`
用户问需要计算的问题 → Agent 调 `calculator`

**Agent 自己决定用什么工具，用几次，什么时候停止。**

### 7.5 传统 RAG vs Agentic RAG

| | 传统 RAG | Agentic RAG |
|--|---------|------------|
| **流程** | 线性，固定 | 循环，动态 |
| **检索次数** | 固定 1 次 | 按需，1 到 N 次 |
| **工具使用** | 只有检索 | 检索 + 计算 + API + 代码... |
| **自我判断** | 没有 | 会判断结果是否足够 |
| **适合场景** | 简单问答 | 复杂推理、多步骤任务 |
| **成本** | 低 | 高（多次 LLM 调用） |
| **可控性** | 高 | 相对低（行为不确定） |

---

## 八、完整的知识地图

把三篇的内容串起来，你现在掌握的是这样一张地图：

```
┌─────────────────────────────────────────────────────────────┐
│                      Agentic RAG（决策层）                    │
│  LLM 作为 Agent，主动决策：用什么工具，用几次，什么时候停止     │
└──────────────────────────────┬──────────────────────────────┘
                               │ 调用
┌──────────────────────────────▼──────────────────────────────┐
│                    混合检索流水线（工具层）                     │
│                                                             │
│  Query Augment → ES 词条检索 ─┐                             │
│                               ├─ 合并去重 → Rerank → Top K  │
│                Milvus 语义检索─┘                             │
└──────────────────────────────┬──────────────────────────────┘
                               │ 依赖
┌──────────────────────────────▼──────────────────────────────┐
│                      基础设施层                               │
│                                                             │
│  ES（倒排索引 + IK 分词 + BM25）                             │
│  Milvus（Embedding 向量 + 余弦相似度）                        │
│  Rerank 模型（Cross-Encoder 精排）                           │
└─────────────────────────────────────────────────────────────┘
```

- **第一篇**：ES 基础概念（倒排索引、IK 分词、BM25）→ 基础设施层
- **第二篇**：ES 实战 CRUD + 混合检索代码 → 工具层
- **这篇**：Rerank + Query Augment + 完整流水线 + Agentic RAG → 工具层 + 决策层

---

## 九、小结

| 概念 | 一句话 |
|------|--------|
| **Rerank** | 混合检索之后的质量守门员，Cross-Encoder 精排，比 BM25 和余弦相似度更准 |
| **Query Augment** | 用 LLM 把一个问题改写成多角度问句，6 路检索覆盖面更广 |
| **混合检索流水线** | 改写 → 6 路检索 → 合并去重 → Rerank → Top 3 → LLM |
| **Agentic RAG** | 给 RAG 加上 LLM 大脑，主动决策用什么工具、用几次、什么时候停止 |
| **ReAct** | Thought → Action → Observation 循环，Agentic RAG 最主流的实现模式 |

**一句话总结这套架构的价值：**

> ES 保证精确不漂移，Milvus 保证语义能召回，Query Augment 保证覆盖面够广，Rerank 保证最终排序最准，Agentic RAG 保证复杂问题能多步推理——每一层都在解决上一层解决不了的问题。

---

## 代码文件索引

| 文件 | 做什么 |
|------|--------|
| `src/rag/seed-data.mjs` | 数据写入：同时写 ES 索引和 Milvus 集合 |
| `src/rag/query-augment.mjs` | LLM 改写 query 为 3 条多角度问句 |
| `src/rag/hybrid-retrieval.mjs` | 完整混合检索 + Rerank 流水线 |
| `src/rerank/dashscope-rerank.mjs` | DashScope Rerank API 封装 |
| `src/rerank/test.mjs` | Rerank 模型单独测试 |

---

## 下一篇

这篇把混合检索流水线跑通了，也引入了 Agentic RAG 的概念。

下一步是真正实现一个 Agentic RAG——用 LangChain Agent 注册工具、实现 ReAct 循环、处理多步推理，把今天的混合检索流水线作为一个工具挂进去，让 LLM 自己决定什么时候调它。

---

> *昇哥 · 2026年7月*
> *90后 JS 全栈 × AI 学习途中，把踩过的坑写下来*
> *专注羽毛球，爱音乐，正在研究易经 🎵🏸*
