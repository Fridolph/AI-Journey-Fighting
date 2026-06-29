# Agentic RAG：基于 LangGraph 实现大模型自主决策的 RAG 闭环

> 📖 **深度学习笔记**：[02 — naive-rag 与 query-router：从固定管道到动态路由](./02-naive-rag-query-router.md) | [03 — 多跳检索与网络兜底：从一次检索到"会思考的检索"](./03-rag-multihop-web-fallback.md)

## 四个脚本的关系

| 文件 | 核心思想 | 复杂度 |
|------|---------|--------|
| `naive-rag.mjs` | 基础 RAG：检索 → 生成，无判断 | ★☆☆ |
| `rag-query-router.mjs` | 路由判断：简单问题直接答，复杂问题走 RAG | ★★☆ |
| `rag-webfallback.mjs` | 本地查不到时回退到网络搜索 | ★★★ |
| `rag-multihop.mjs` | 多跳检索：拆解子问题，逐轮检索 | ★★★★ |

---

## 通用知识：LangGraph 三要素

```
State（共享黑板）  →  Node（处理单元）  →  Edge（流转规则）
      ↑                    ↑                  ↑
 Annotation.Root()     addNode()      addEdge / addConditionalEdges
 节点间共享同一份数据   input=state    decideNext(state) → 下一个节点名
                       return 新的state
```

### 开发三步走

```
① 拆业务 → 列出所有节点（route / retrieve / generate / direct_answer ...）
② 定流转 → 画箭头（哪个节点 → 哪个节点，条件判断用 addConditionalEdges）
③ 写代码 → graph.addNode().addEdge().compile().invoke()
```

---

## 脚本一：naive-rag.mjs — 基础 RAG

```
流程：START → retrieve(向量检索) → generate(LLM回答) → END

State: { question, k, documents, generation }
```

就是一个最简单的 RAG 链——没有条件判断、没有路由，纯线性流程。

---

## 脚本二：rag-query-router.mjs — 路由判断

### 核心创新

```
之前：正则判断"你好 / 测试 → 简单，其他 → RAG"（脆弱）
现在：LLM 路由 withStructuredOutput，语义判断（健壮）
```

### 流程图

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

### addConditionalEdges 的正确理解

```js
.addConditionalEdges("route_question", decideNext, {
  direct_answer: "direct_answer",  // 返回 "direct_answer" → 跳到 direct_answer 节点
  retrieve:      "retrieve",       // 返回 "retrieve"      → 跳到 retrieve 节点
})

// decideNext 是判断函数，不是目标节点！
function decideNext(state) {
  return state.strategy === "simple" ? "direct_answer" : "retrieve";
}
```

### withStructuredOutput 兼容性踩坑

| 报错 | 原因 | 修复 |
|------|------|------|
| `response_format type unavailable` | qwen 不支持 json_schema | `method: "functionCalling"` |
| `thinking mode does not support tool_choice` | thinking 模型不支持 tool_choice | 换非 thinking 模型 或 拆 routerLlm + llm 两个实例 |

```js
// routerLlm 用非 thinking + functionCalling
const routerLlm = new ChatOpenAI({
  model: "deepseek-v4-flash",
  modelKwargs: { thinking: { type: "disabled" } },
});
const router = routerLlm.withStructuredOutput(RouteSchema, {
  method: "functionCalling",
  name: "route_question",
});
```

---

## 脚本三：rag-webfallback.mjs — 网络兜底

```
本地检索 → 相关性评估
  ├─ relevant    → RAG 生成
  └─ irrelevant  → web_search + RAG 生成
```

新增节点：`evaluate`（本地检索是否相关）、`web_search`（网络备用检索）

---

## 脚本四：rag-multihop.mjs — 多跳检索（核心升级）

### 流程图

```
START → route_question
              │
    ┌─────────┴─────────┐
    ▼                   ▼
  simple              complex
    │                   │
direct_answer       decompose      ← 新增：LLM 拆解子问题
    │                   │
    ▼                   ▼
  END               retrieve       ← 每次取一个子问题检索
                        │
                        ▼
                 plan_next_step    ← 新增：判断是否继续
                   │         │
             retrieve ←──→ generate → END
             （循环）      （终止）
```

### 三个核心机制

**① decompose_question — 子问题拆解：**
一条复杂问题被 LLM 拆成有序子问题数组，每条必须独立可检索（不允许"他/她/此人"等指代）。

**② nextSubIdx 游标驱动循环：**
```js
第1轮：idx=0 → 检索子问题[0] → idx变成1
第2轮：idx=1 → 检索子问题[1] → 返回 { nextSubIdx: idx + 1 }
```
游标是驱动引擎，`plan_next_step` 判断是否继续。

### 循环控制：用 State 字段模拟 while 循环

```
retrievalCount = 循环跑了几次（retrieve 负责 +1）
maxRetrievals  = 循环最多跑几次（兜底防死循环）
plannedNext    = 这次循环结束后往哪跳（plan 写入 → afterPlan 读取 → 条件边跳转）
currentQuery   = 本轮查询句快照（纯调试，不影响逻辑）
```

**plannedNext 的数据流向：**
```js
// plan 节点写入决策 → afterPlan 读取 → 条件边跳转
return { plannedNext: "retrieve" | "generate" };

function afterPlan(state) {
  return state.plannedNext === "retrieve" ? "retrieve" : "generate";
}
.addConditionalEdges("plan_next_step", afterPlan, { retrieve:"retrieve", generate:"generate" })
```

**三轮循环状态变化：**
```
初始: retrievalCount=0, nextSubIdx=0
第1轮: retrieve(0→1, idx 0→1) → plan(remaining=2, plannedNext="retrieve") → 跳回
第2轮: retrieve(1→2, idx 1→2) → plan(remaining=1, plannedNext="retrieve") → 跳回
第3轮: retrieve(2→3, idx 2→3) → plan(remaining=0, 硬性强制 "generate") → END ✅
```

**双重保险（LLM判断 + 硬性规则兜底）：**
```js
let finalNext = nextAction;                           // LLM 建议
if (state.retrievalCount >= state.maxRetrievals)      // 超上限
    finalNext = "generate";
if (remaining <= 0)                                   // 子问题全检索完
    finalNext = "generate";
```

**④ mergeUnique 多轮去重：**

多轮检索可能召回同一文档，按 id 去重 + 保留更高 score。

### GraphState 设计推导法

**不是背出来的，是从业务流程推导出来的。**

第一步：画流程图，列出每个节点读什么、写什么：

| 节点 | 需要读 | 需要写 |
|---|---|---|
| `route` | `question` | `strategy`, `routeReason` |
| `decompose` | `question` | `subQuestions`, `nextSubIdx` |
| `retrieve` | `subQuestions`, `nextSubIdx`, `k` | `documents`, `retrievalCount`, `nextSubIdx` |
| `plan` | `subQuestions`, `nextSubIdx`, `documents`, `retrievalCount`, `maxRetrievals` | `plannedNext` |
| `generate` | `documents`, `question` | `generation` |

第二步：合并去重所有字段 → 得到 GraphState。

第三步：特别补充**循环记忆**字段（有 retrieve ↔ plan 来回跳时必须的）：

| 字段 | 作用 |
|------|------|
| `nextSubIdx` | 游标：当前该检索第几个子问题 |
| `retrievalCount` | 已检索几轮，防止死循环 |
| `maxRetrievals` | 上限配置 |
| `plannedNext` | 下一跳是 retrieve 还是 generate |

**两个常见错误：**
- ❌ 把节点内部的临时变量放进了 State（原则：只放跨节点传递的）
- ❌ 忘了补充循环记忆字段（有循环就必须有游标 + 计数器 + 终止条件）

### 三个脚本演进对比

| 能力 | naive-rag | query-router | multihop |
|---|---|---|---|
| 简单问题跳过检索 | ❌ | ✅ | ✅ |
| 问题路由分流 | ❌ | ✅ | ✅ |
| 复杂问题拆子问题 | ❌ | ❌ | ✅ |
| 多轮循环检索 | ❌ | ❌ | ✅ |
| 跨轮文档去重 | ❌ | ❌ | ✅ |
| 防死循环保护 | ❌ | ❌ | ✅ |

### 实测评估

问题：「四大恶人排行第二的是谁？此人之子在身世揭晓前，其生父在武林中的公开身份是什么？」

| 环节 | 评分 | 说明 |
|---|---|---|
| 路由 | ⭐⭐⭐⭐⭐ | strategy=complex ✓ |
| 子问题拆解 | ⭐⭐⭐ | 模型把「第二」自作聪明改成「之首」拆题 |
| 多轮检索 | ⭐⭐⭐⭐ | 机制正确，召回覆盖关键情节 |
| 最终回答 | ⭐⭐⭐⭐ | generate 节点靠文档自我纠正回正确 |

**核心洞察：** 子问题拆解质量决定检索链走向。Prompt 需加硬约束禁止模型"修正"用户问题。

### withStructuredOutput 的 llm 分工规则

| 节点 | 使用的 llm | 原因 |
|---|---|---|
| `routeQuestion / decompose / planNext` | `routerLlm` | 需要结构化输出，thinking 必须关 |
| `directAnswer / generate` | `llm` | 普通流式生成，thinking 无影响 |

**凡是 `withStructuredOutput` 都用 `routerLlm`；普通 `stream`/`invoke` 用 `llm`。**

## 应用到 my-resume 项目

```
State: { question, intent, context, generation }

节点：
  route_intent  → 闲聊 / 引导 / 简历问答
  chitchat      → 直接回复
  guide         → 返回引导词
  retrieve      → Milvus 检索简历
  rag_answer    → 基于简历内容生成回答

流转：
  START → route_intent
  route_intent --[chitchat]--→ chitchat       → END
  route_intent --[guide]----→ guide          → END
  route_intent --[resume]---→ retrieve       → rag_answer → END
```
