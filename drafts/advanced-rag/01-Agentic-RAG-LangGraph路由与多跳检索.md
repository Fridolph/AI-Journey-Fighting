# Agentic RAG：基于 LangGraph 实现大模型自主决策的 RAG 闭环

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

## 脚本四：rag-multihop.mjs — 多跳检索

```
复杂问题 → 拆解子问题 → [检索 → 分析 → 决定是否继续] → 汇总 → 生成

节点：decompose → retrieve → analyze → commit_sub → aggregate → generate
```

LLM 先拆成多个子问题，逐个检索，最后汇总生成。适合「雁门关事件的主谋，他的儿子最终结局」这类需要拼多个知识点的问题。

---

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
