/**
 * checkpointer-memory-learning.mjs
 *
 * 学习版 — 对 examples/langgraph-test/src/checkpointer-memory.mjs 的逐行注释
 * 原始文件保持不变，本文件仅用于学习理解
 *
 * ============================================
 * 核心思路：从"一次性管道"升级到"可持久化的状态机"
 *
 * 前 3 篇的图每次 invoke 都是从头开始
 * 这节引入 checkpointer → 状态跨 invoke 持久化 + 会话隔离
 * ============================================
 */

import {
  Annotation,
  END,
  MemorySaver,  // ← 首次真正使用！前 3 篇的 import 是伏笔
  START,
  StateGraph,
} from "@langchain/langgraph";

// ─── ① State 定义 — 熟悉的模式 ──────────────────────────────
// 两个字段：visitCount 自增计数器 + message 输出
// reducer 依然是覆盖式更新
const StateAnnotation = Annotation.Root({
  visitCount: Annotation({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  message: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

// ─── ② 节点 — 读旧值写新值 ──────────────────────────────────
// 注意：这次节点没有"创建初始值"
// visitCount 从 checkpointer 恢复的上次存档值开始累加
function recordVisit(state) {
  const visitCount = state.visitCount + 1;
  const message =
    visitCount === 1
      ? "这是你在本会话里第 1 次进入。"
      : `这是你在本会话里第 ${visitCount} 次进入`;
  return { visitCount, message };
}

// ─── ③ 搭图 — 和前面一样的链式 API ──────────────────────────
const graph = new StateGraph(StateAnnotation)
  .addNode("recordVisit", recordVisit)
  .addEdge(START, "recordVisit")
  .addEdge("recordVisit", END);

// ─── ★ ④ 注入 checkpointer — 核心变化 ──────────────────────
// MemorySaver = 内存里的 Map<thread_id, State[]>
// 每次节点执行完毕，自动把当前 state 快照存进去
const checkpointer = new MemorySaver();

// compile({ checkpointer }) → 告诉 LangGraph "请自动存档"
// compile() 的返回值也从 graph 变成了 app
// 语义区别：graph 是"蓝图"，app 是"已部署的服务"
const app = graph.compile({ checkpointer });

// ─── ★ ⑤ 会话隔离 — thread_id ─────────────────────────────
// configurable.thread_id = 会话身份证
// 同一个 thread_id 共享状态，不同 thread_id 完全隔离
const user1 = { configurable: { thread_id: "用户-小张" } };
const user2 = { configurable: { thread_id: "用户-小李" } };

// ─── ★ ⑥ 跨 invoke 持久化 ──────────────────────────────────
// 小张 3 次 invoke → visitCount 持续累加
// 关键行为：invoke 时自动加载上次存档，
//           recordVisit 以存档值为起点，执行完再自动存档
const res1 = await app.invoke({}, user1);  // visitCount: 0→1 → 存档
const res2 = await app.invoke({}, user1);  // 读取存档 1 → 1→2 → 存档
const res3 = await app.invoke({}, user1);  // 读取存档 2 → 2→3 → 存档
// 小李 1 次 invoke → 从头开始，不受小张影响
const res4 = await app.invoke({}, user2);  // 无存档 → 0→1 → 存档

// 输出验证
console.log(res1);  // { visitCount: 1, message: "第 1 次" }
console.log(res2);  // { visitCount: 2, message: "第 2 次" }
console.log(res3);  // { visitCount: 3, message: "第 3 次" }
console.log(res4);  // { visitCount: 1, message: "第 1 次" }

// ─── 思维模型 ──────────────────────────────────────────────
// 没有 checkpointer 时：
//   app.invoke({})          → visitCount: 1
//   app.invoke({})          → visitCount: 1  ← 永远从 0 开始！
//
// 有了 checkpointer 后：
//   app.invoke({}, "小张")  → visitCount: 1
//   app.invoke({}, "小张")  → visitCount: 2  ← 记住了上一次！
//   app.invoke({}, "小李")  → visitCount: 1  ← 独立隔离！
//
// 前端类比：
//   Map<string, State[]> checkpointer
//   ├── "用户-小张" → [{ visitCount: 1 }, { visitCount: 2 }, { visitCount: 3 }]
//   └── "用户-小李" → [{ visitCount: 1 }]
