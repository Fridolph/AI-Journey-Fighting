# 03 — 多跳检索与网络兜底：从一次检索到"会思考的检索"

> 学习日期：2026-05-24
> 原始文件：`examples/advanced-rag/src/rag-multihop.mjs` / `rag-webfallback.mjs`

---

## 一、学习目标

- 理解**多跳检索**：LLM 拆解子问题 → 逐轮检索 → 循环控制 → 合并生成
- 理解**网络兜底**：检索结果不够 → LLM 评估 → 生成 web_query → 网络搜索 → 回填 → 再评估
- 掌握 Agentic RAG 的核心：**LLM 作为决策中枢**，自主控制检索闭环

---

## 二、rag-multihop.mjs：子问题拆解 + 多轮循环检索

### 2.1 图结构

Mermaid 渲染出来的图：

```
START → route_question ──simple──→ direct_answer → END
              │
           complex
              │
         decompose_question         ← ★ 新增
              │
              ▼
           retrieve
              │
              ▼
         plan_next_step             ← ★ 新增
           │        │
        retrieve  generate          ← 🔄 回边到 retrieve
        (继续检索)  (够了)
                      │
                      ▼
                    END
```

**两个新增节点让 RAG 从"一次检索"变成"多轮循环检索"。**

### 2.2 decompose_question：LLM 拆解子问题

```js
const decomposeQuestionNode = async (state) => {
  const decomposer = routerLlm.withStructuredOutput(DecomposeSchema, {
    method: "functionCalling",
    name: "decompose_question",
  });
  const out = await decomposer.invoke(`
将问题拆成有序子问题列表 sub_questions。
要求：
1. 链式推理必须拆成多条；单跳的可以只 1 条
2. 每条必须是完整中文问句，禁止「他/她/此人」等指代
3. 顺序必须符合推理链
`);
  return { subQuestions, nextSubIdx: 0 };
};
```

**以 "四大恶人排行第二的是谁？此人之子…其生父公开身份？" 为例：**

```
拆解结果：
  1. 《天龙八部》中「四大恶人」排行第二的是谁？
  2. 《天龙八部》中，四大恶人之第二恶人的儿子是谁？
  3. 《天龙八部》中，四大恶人之第二恶人的儿子在身世揭晓前，
     其生父在武林中的公开身份是什么？
```

三条子问题形成推理链——必须先知道"第二恶人是谁"才能查"其子是谁"，才能查"其子生父的身份"。

### 2.3 retrieve 节点：游标驱动逐轮检索

```js
const retrieveNode = async (state) => {
  const subs = state.subQuestions ?? [];
  const idx = state.nextSubIdx ?? 0;    // ★ 游标：当前轮到第几条
  const q = subs[idx];

  const newDocs = await retrieveRelevantContent(q, state.k);
  const merged = mergeUnique(state.documents ?? [], newDocs);  // 去重

  return {
    documents: merged,
    retrievalCount: state.retrievalCount + 1,  // 轮次 +1
    nextSubIdx: idx + 1,                         // ★ 游标推进
  };
};
```

**游标模式：**

| 轮次 | `nextSubIdx` | 检索的子问题 | 结果 |
|------|-------------|-------------|------|
| 第 1 轮 | 0 → 1 | "四大恶人排行第二是谁？" | 子问题 1 已检 |
| 第 2 轮 | 1 → 2 | "第二恶人的儿子是谁？" | 子问题 2 已检 |
| 第 3 轮 | 2 → 3 | "其子生父公开身份？" | 全部检完 |

每次检索新增的文档 mergeUnique 去重，按 id 保留更高 score。

### 2.4 plan_next_step：决策是否继续

```js
const planNextStepNode = async (state) => {
  const remaining = state.subQuestions.length - state.nextSubIdx;

  // LLM 决策
  const { nextAction } = await model.invoke(prompt);

  // ★ 双重保险：硬性规则兜底
  let finalNext = nextAction;
  if (state.retrievalCount >= state.maxRetrievals) finalNext = "generate";  // 超上限
  if (remaining <= 0) finalNext = "generate";                               // 全检完

  return { plannedNext: finalNext };
};
```

**这是 langgraph-test 的 loop-retry 模式在此的复用——** LLM 判断 + 硬性兜底，循环控制一模一样：

| loop-retry | rag-multihop |
|-----------|-------------|
| `tries >= 3` → 退出 | `retrievalCount >= maxRetrievals` → generate |
| `ok` 变量驱动 | `nextSubIdx` 游标驱动 |
| 条件边指向自身 | `plan_next_step → retrieve` 回边 |

### 2.5 验证运行

```
问题：四大恶人排行第二的是谁？此人之子...其生父公开身份？

拆解 3 条子问题
第 1 轮检索：四大恶人排行第二的是谁？
第 2 轮检索：第二恶人的儿子是谁？
第 3 轮检索：其子生父的公开身份？
[决策] remaining=0 → generate ✅

回答：叶二娘，其子虚竹，生父玄慈（少林方丈）
```

---

## 三、rag-webfallback.mjs：网络搜索兜底

### 3.1 图结构

```
START → route_question ──simple──→ direct_answer → END
              │
           complex
              │
         local_retrieve
              │
         evaluate_local             ← ★ 评估节点
          │         │
       enough   not_enough
          │         │
       generate   web_search ← ★ 网络搜索
          │         │
         END    evaluate_local ← 🔄 回边到评估（带网络结果再评）
```

### 3.2 evaluate_local：信息充分性评估

```js
const evaluateNode = async (state) => {
  const evaluator = llm.withStructuredOutput(EvaluateSchema);
  const out = await evaluator.invoke(`
判断当前上下文是否足以回答用户问题。

已检索上下文：${state.localContext}
联网搜索结果：${state.webContext || "（空）"}

输出：
- enough: 是否足够
- missing: 若不够，列出缺失信息点
- web_query: 若不够，给出联网搜索查询句
`);
  return { evaluation: JSON.stringify(out) };
};
```

**关键设计**：评估节点会被调用两次——第一次判断本地检索够不够，第二次判断本地+网络够不够。同一节点，不同 state，不同判断。

### 3.3 afterEvaluateLocal 条件边

```js
function afterEvaluateLocal(state) {
  if (state.webContext) return "generate";  // 已经走了网络搜索 → 够了

  const parsed = JSON.parse(state.evaluation);
  return parsed.enough ? "generate" : "web_search";
}
```

| 情况 | 走向 |
|------|------|
| 第一次评估：本地够 | `generate` |
| 第一次评估：本地不够 | `web_search` → 网络搜索 |
| 第二次评估：本地+网络够了 | `generate` |

### 3.4 关键区别：不回边不回退

和 multihop 的 `plan_next_step → retrieve` 回边不同，webfallback 的循环是 `web_search → evaluate_local`——**只加一轮网络搜索**，不会再触发本地检索。这是一个"固定轮次"的兜底，而不是"动态循环"的重试。

---

## 四、四个脚本的递进关系

| 脚本 | 解决问题 | 核心创新 | 图复杂度 |
|------|---------|---------|---------|
| `naive-rag` | 基础管道 | LangGraph 搭 RAG | ★ 线性 |
| `rag-query-router` | 简单问题白检 | LLM 路由判断 | ★★ 分叉 |
| **`rag-multihop`** | **复杂问题多步推理** | **子问题拆解 + 循环检索** | **★★★★ 回边循环** |
| **`rag-webfallback`** | **本地不够切网络** | **评估 + 网络兜底** | **★★★ 条件回边** |

**前面所有的 LangGraph 概念在这里全部出场：**

| 概念 | 在哪出现 |
|------|---------|
| `StateGraph` + `addNode` | 全篇 |
| `addEdge` 线性边 | naive-rag、各文件的基础路径 |
| `addConditionalEdges` 条件分叉 | query-router（simple/complex）、multihop（retrieve/generate）、webfallback（generate/web_search） |
| 回边（自环） | multihop（plan_next_step → retrieve 🔄）、webfallback（web_search → evaluate 🔄） |
| `withStructuredOutput` | route_question、decompose、evaluate、plan_next_step |
| `model.stream` 流式 | generate 节点 |

---

## 五、什么是 Agentic RAG

**定义**：LLM 作为决策中枢，自主控制检索方式、评估检索效果、判断是否需要补充检索或发起网络搜索，形成自主思考与迭代优化的闭环检索系统。

| 传统 RAG | Agentic RAG |
|---------|-------------|
| query → 向量化 → 检索 → 生成 | query → 路由 → 拆解/评估 → 检索（多轮）→ 再评估 → 兜底 → 生成 |
| 固定流程，不问对错 | **自我决策、自我反思、自我修正** |
| 一次检索，一次回答 | 可以多轮、切换数据源、回退兜底 |

**核心就是"让 LLM 来管检索的事"，不是你来管。**

---

## 六、实际业务中的取舍

Agentic RAG 不是"全都要"。实际业务中：

```
学习版（我们写的）：
  route → decompose → retrieve × N → plan → generate + evaluate → web fallback

生产版（你公司项目的）：
  意图识别 → 模板匹配 → 多路检索（向量/全文/SQL/Web）→ 合并
```

**区别不在技术栈，在设计思路**：
- 学习版追求"LLM 自主决策"——每个环节都交给 LLM
- 生产版追求"可控 + 可预期"——模板驱动，规则优先，LLM 辅助

两者都可以叫 Agentic RAG，只是"自主程度"不同。选择哪一种取决于业务对稳定性、成本、可解释性的要求。

---

## 七、踩坑

| 问题 | 原因 | 位置 |
|------|------|------|
| `withStructuredOutput` 报 `function calling not supported` | thinking 模型不支持 | 用 `modelKwargs: { thinking: { type: "disabled" } }` |
| Milvus 中文检索报 ByteString 编码错误 | node-milvus 版本 Unicode 兼容问题 | 不影响流程验证（LLM 知识兜底） |
| `Collection not found: ebook_collection` | collection 名不匹配 | webfallback 文件配置问题 |

---

## 八、下一步

四个文件覆盖了从"朴素 RAG"到"Agentic RAG"的完整升级路径。需要深入学习的方向：
- ElasticSearch 关键词检索（解决专业术语匹配不准）
- `multi-agent-pro-1/2`：把多 Agent 编排和 Agentic RAG 结合起来
