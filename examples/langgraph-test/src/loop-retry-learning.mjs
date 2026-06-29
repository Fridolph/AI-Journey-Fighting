/**
 * loop-retry-learning.mjs
 *
 * 学习版 — 对 examples/langgraph-test/src/loop-retry.mjs 的逐行注释
 * 原始文件保持不变，本文件仅用于学习理解
 *
 * ============================================
 * 核心思路：回边（Back Edge）= 循环的声明式表达
 *
 * 三部曲走完：
 *   basic-graph:          线性 → 一条路走到黑
 *   conditional-routing:  分叉 → 根据条件走不同分支
 *   loop-retry:           回边 → 不满足条件就回到自身重试
 * ============================================
 */

// 注意：MemorySaver 被 import 了但在这个文件里没有使用
// 这是一个"伏笔"——后面 checkpointer 文件会真正用到它
// 此处 import 可能是保留的模板引用
import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";

// ─── ① State 设计 — "给自己记账" ─────────────────────────────
// 前两篇的 State 都是"不同节点各读写自己的字段"
// 这里的 State 是"一个节点反复执行，自己给自己记流水账"
const StateAnnotation = Annotation.Root({
  // tries：重试计数器
  // 类似前端 fetch 封装里的 retryCount
  tries: Annotation({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  // ok：是否成功退出循环
  ok: Annotation({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  // message：给调用方看的结果信息
  message: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

// ─── ② attempt 节点 — "记账员 + 裁判 + 操作工" ──────────────
// 前两篇：router 只判断不干活 / mathNode 只干活不判断
// 这里：一个节点包揽了"记账、判断、输出"三件事
//
// 为什么能合在一起？因为 State 的三个字段各司其职：
//   tries   ← 记账（写计数器）
//   ok      ← 判断（写成功标记）
//   message ← 输出（写结果信息）
const attempt = (state) => {
  // 第 1 件事：记账——重试次数 +1
  const tries = state.tries + 1;
  // 第 2 件事：判断——达到 3 次就算成功
  const ok = tries >= 3;
  // 第 3 件事：输出——告诉调用者当前状态
  return {
    tries,
    ok,
    message: ok ? `第 ${tries} 次成功` : `第 ${tries} 次失败，继续重试`,
  };
};

// 孤零零的 MemorySaver —— 看起来是这段代码的一个"痕迹"
// 可能作者最初想在这里演示 checkpointer，后来拆到独立文件了
// 它不报错，但是确实没用
MemorySaver;

// ─── ③ 搭图 — 自环（回边） ──────────────────────────────────
// 和 conditional-routing 一模一样的 addConditionalEdges API
// 唯一区别：路由表的值指向了自身节点
const graph = new StateGraph(StateAnnotation)
  .addNode("attempt", attempt)
  .addEdge(START, "attempt")
  // ★ 条件边：返回 "done" 走 END，返回 "retry" 走 attempt（自环！）
  .addConditionalEdges("attempt", (state) => (state.ok ? "done" : "retry"), {
    retry: "attempt",  // ← 回边：关键就在这里！指向自身
    done: END,
  })
  .compile();

// ─── ④ Mermaid 可视化 ──────────────────────────────────────
// 看 Mermaid 图里的 attempt 节点：
//   attempt -.-> attempt  ← 虚线回边，标签 "retry"
//   attempt -.-> END      ← 虚线出口，标签 "done"
// 一条虚线回到自身，一条虚线走向出口——两种条件走不同方向
const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({ withStyles: true });
console.log(mermaid);

// ─── ⑤ 执行 ─────────────────────────────────────────────────
// invoke 一次，图内部循环 3 次，最后一次 ok=true 才退出
// 从调用者的视角来看：invoke 一个 await 就搞定了，内部 loop 是透明的
const result = await graph.invoke({ tries: 0 });
console.log("result:", result);

// ─── 思维模型 ──────────────────────────────────────────────
// 三部曲类比：
//   1. 线性图  = 工厂流水线（物料依次经过 A→B→C）
//   2. 条件图  = 快递分拣线（扫码后分到 math 通道或 chat 通道）
//   3. 回边图  = 质检回流线（不合格品退回上一个工位返工）
//
// 前端代码对照：
//   // 没有 LangGraph 时的等价写法
//   let state = { tries: 0, ok: false, message: "" };
//   while (!state.ok) {
//     state.tries++;
//     state.ok = state.tries >= 3;
//     state.message = state.ok ? "成功" : "失败";
//   }
//
//   // LangGraph 写法（声明式）
//   // 你只说"attempt 之后，ok 就去 END，没 ok 就回 attempt"
//   // 循环几次、怎么退出，引擎自动处理
