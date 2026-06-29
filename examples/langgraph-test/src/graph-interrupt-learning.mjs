/**
 * graph-interrupt-learning.mjs
 *
 * 学习版 — 对 examples/langgraph-test/src/graph-interrupt.mjs 的逐行注释
 * 原始文件保持不变，本文件仅用于学习理解
 *
 * ============================================
 * 核心思路：Human-in-the-loop（人在回路中）
 *
 * 前几篇的图都是"跑完就结束"
 * 这节让图在中间停下来，等你输入决策后再继续
 * ============================================
 */

import { createInterface } from "node:readline/promises";
import {
  Annotation,
  Command,      // ★ 新面孔：用来"唤醒"暂停的图
  END,
  MemorySaver,  // ★ interrupt 必须配合 checkpointer，否则报错
  START,
  StateGraph,
  interrupt,    // ★ 新面孔：在节点内暂停图执行
} from "@langchain/langgraph";

// ─── ① State 定义 ──────────────────────────────────────────
const StateAnnotation = Annotation.Root({
  // actionSummary：给用户看的操作描述
  actionSummary: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  // userInput：用户通过 resume 传回的值
  userInput: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

// ─── ② 两个节点的职责分工 ──────────────────────────────────
// 节点 A：showTransfer —— 写入待办摘要
const showTransfer = () => ({
  actionSummary: "向张三转账 ¥100（模拟，不会真扣款）",
});

// 节点 B：waitConfirm —— ★ 在这里暂停等人审批
const waitConfirm = (state) => {
  // interrupt() = "图停在这里，等外面给个回复"
  // 参数：打包给外部调用者看的信息（hint 提示 + 上下文）
  // 返回值：外部调用者 invoke(Command({ resume: xxx })) 中的 xxx
  const text = interrupt({
    hint: "终端里输入「确认」或备注后回车，图才会继续",
    actionSummary: state.actionSummary,
  });
  // 当外部调用 Command({ resume: "确认" }) 后
  // text = "确认"，继续往下走
  return { userInput: String(text) };
};

// ─── ③ 搭图 ──────────────────────────────────────────────
// Mermaid 图是线性的，interrupt 的行为不在边里声明
// 而是在 waitConfirm 节点内部触发
const graph = new StateGraph(StateAnnotation)
  .addNode("showTransfer", showTransfer)
  .addNode("waitConfirm", waitConfirm)
  .addEdge(START, "showTransfer")
  .addEdge("showTransfer", "waitConfirm")
  .addEdge("waitConfirm", END)
  // ★ compile 时注入 checkpointer —— 没有它会报错
  // interrupt 需要 checkpointer 来保存"停在哪里"的上下文
  .compile({ checkpointer: new MemorySaver() });

// ─── ④ 第一次 invoke：暂停 ────────────────────────────────
// 图走到 waitConfirm 时遇到 interrupt() → 立即暂停
// 返回值不是正常 State，而是包含 __interrupt__ 的特殊对象
const config = { configurable: { thread_id: "interrupt-demo" } };
const paused = await graph.invoke({}, config);

// __interrupt__ 里装着 interrupt() 传的参数
console.log("\n待你确认：", paused.__interrupt__?.[0]?.value);
// 输出：{ hint: "...", actionSummary: "向张三转账 ¥100..." }

// ─── ⑤ 终端读取用户输入 ──────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout });
const line = (await rl.question("> ")).trim();
await rl.close();

if (!line) {
  console.error("未输入，退出。");
  process.exit(1);
}

// ─── ★ ⑥ 第二次 invoke：恢复 ─────────────────────────────
// 关键区别：传递的是 new Command({ resume: line })，而不是普通 State
// Command 告诉 LangGraph："之前那个 interrupt，我用这个值回应"
// line 会成为 waitConfirm 中 interrupt() 的返回值
const done = await graph.invoke(new Command({ resume: line }), config);

// 最终结果：{ actionSummary: "...", userInput: line }
// userInput 的值就是你输入的内容
console.log("结果：", done);

// ─── 思维模型 ──────────────────────────────────────────────
// 前端类比：
//   没有 interrupt 的图         =   async function() { a(); b(); }
//   有 interrupt 的图           =   Generator function 中的 yield
//
//   interrupt()               →   yield { hint, actionSummary }
//   调用者读取 __interrupt__    →   拿到 yield 抛出的值
//   Command({ resume: x })     →   generator.next(x)
//   interrupt() 的返回值       =   next() 传入的 x
//
// 本质差异：
//   普通函数：一次调用跑到底，结果一次性返回
//   Generator：分段执行，调用者控制"何时继续" + "传什么值进去"
//
// 后续的 interrupt-pro 就是在此基础上做了多轮交互和条件分支
