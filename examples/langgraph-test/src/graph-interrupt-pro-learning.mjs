/**
 * graph-interrupt-pro-learning.mjs
 *
 * 学习版 — 对 examples/langgraph-test/src/graph-interrupt-pro.mjs 的逐行注释
 * 原始文件保持不变，本文件仅用于学习理解
 *
 * ============================================
 * 核心思路：将前 5 篇的所有核心概念组合成一个可用的转账业务
 *
 *   basic-graph:            线性边
 *   conditional-routing:    条件路由（valid/invalid + confirmed/cancelled）
 *   loop-retry:             回边校验（invalid → askAmount）
 *   checkpointer-memory:    compile({ checkpointer }) 支撑 interrupt
 *   graph-interrupt:        interrupt + Command 的暂停恢复
 *
 * 这个文件 = 上述 5 篇能力的组合应用
 * ============================================
 */

import { createInterface } from "node:readline/promises";
import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";

// ─── ① State 定义 — 5 个字段各司其职 ──────────────────────
const StateAnnotation = Annotation.Root({
  balance: Annotation({       // 钱包余额，初始 500
    reducer: (_prev, next) => next,
    default: () => 500,
  }),
  amount: Annotation({        // 转账金额，由用户输入决定
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  actionSummary: Annotation({ // 展示给用户的摘要
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  userInput: Annotation({     // 用户确认文本
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  status: Annotation({        // 最终状态：confirmed / cancelled
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

// ─── ② askAmount — ① 暂停 + 校验 ─────────────────────────
const askAmount = (state) => {
  // 第一次 interrupt：抛出提示，等用户输金额
  const input = interrupt({
    hint: "请输入转账金额（$1 ~ $500）",
    currentBalance: state.balance,
  });

  // 校验逻辑：非法输入 → amount = -1 → 回边回到自身
  const amount = Number(String(input).trim());
  if (isNaN(amount) || amount <= 0 || amount > state.balance) {
    console.log(`\n⚠️  输入不合法「${input}」...`);
    return { amount: -1 };  // -1 触发 invalid 回边
  }

  return { amount };  // 合法 → 继续往前走
};

// ─── ③ showTransfer — 纯展示 ──────────────────────────────
const showTransfer = (state) => {
  console.log("\n══════════════════════════════════");
  console.log("  💰 当前钱包余额：$" + state.balance);
  console.log("  📤 待转账金额：  $" + state.amount);
  console.log("  👤 收款方：      张三");
  console.log("══════════════════════════════════");
  return {
    actionSummary: `向张三转账 $${state.amount}（当前余额 $${state.balance}）`,
  };
};

// ─── ④ waitConfirm — ② 暂停 + 确认 ───────────────────────
const waitConfirm = (state) => {
  // 第二次 interrupt：抛出详细信息，等用户确认/取消
  const text = interrupt({
    hint: '输入「确认」执行转账，输入其他内容取消',
    actionSummary: state.actionSummary,
    currentBalance: state.balance,
    transferAmount: state.amount,
    afterBalance: state.balance - state.amount,
  });
  return { userInput: String(text).trim() };
};

// ─── ⑤ doTransfer — 执行扣款 ──────────────────────────────
const doTransfer = (state) => {
  const newBalance = state.balance - state.amount;
  console.log("\n✅ 转账成功！");
  console.log("  转账金额：$" + state.amount);
  console.log("  扣款前余额：$" + state.balance);
  console.log("  扣款后余额：$" + newBalance);
  return { balance: newBalance, status: "confirmed" };
};

// ─── ⑥ cancelTransfer — 取消 ──────────────────────────────
const cancelTransfer = (state) => {
  console.log("\n❌ 转账已取消。");
  console.log("  余额保持不变：$" + state.balance);
  return { status: "cancelled" };
};

// ─── ⑦ 组装图 ──────────────────────────────────────────
// 这是整个专题中目前最复杂的图拓扑
const graph = new StateGraph(StateAnnotation)
  .addNode("askAmount",      askAmount)
  .addNode("showTransfer",   showTransfer)
  .addNode("waitConfirm",    waitConfirm)
  .addNode("doTransfer",     doTransfer)
  .addNode("cancelTransfer", cancelTransfer)
  .addEdge(START, "askAmount")
  // ★ 条件路由 ①：askAmount → valid → showTransfer 或 invalid → 回边
  .addConditionalEdges("askAmount", (state) => state.amount > 0 ? "valid" : "invalid", {
    valid:   "showTransfer",
    invalid: "askAmount",   // ← 回边：非法 → 重问
  })
  .addEdge("showTransfer", "waitConfirm")
  // ★ 条件路由 ②：waitConfirm → 确认 → doTransfer 或 → cancelTransfer
  .addConditionalEdges("waitConfirm", (state) => state.userInput === "确认" ? "confirmed" : "cancelled", {
    confirmed: "doTransfer",
    cancelled: "cancelTransfer",
  })
  .addEdge("doTransfer",     END)
  .addEdge("cancelTransfer", END)
  .compile({ checkpointer: new MemorySaver() });

// ─── ⑧ 外部调度（invoke 三段式） ──────────────────────────
// 外部代码通过 invoke + Command 驱动图的执行
// 图定义"怎么走"，外部定义"什么时候走"

const config = { configurable: { thread_id: "interrupt-demo" } };
const rl = createInterface({ input: process.stdin, output: process.stdout });

// 段①：首次 invoke → 自动停在第一个 interrupt（askAmount）
let current = await graph.invoke({}, config);
console.log("\n提示：", current.__interrupt__?.[0]?.value?.hint);
console.log("当前余额：$" + current.__interrupt__?.[0]?.value?.currentBalance);

// 段②：while 循环处理 askAmount 的重复输入
// 外部 while + 内部回边 = 两层互补的循环
while (current.__interrupt__?.[0]?.value?.hint?.includes("转账金额")) {
  const amountLine = (await rl.question("> ")).trim();
  current = await graph.invoke(new Command({ resume: amountLine }), config);
  if (current.__interrupt__?.[0]?.value?.hint?.includes("转账金额")) {
    console.log("\n提示：", current.__interrupt__?.[0]?.value?.hint);
    console.log("当前余额：$" + current.__interrupt__?.[0]?.value?.currentBalance);
  }
}

// 段③：展示确认信息，等用户确认/取消
const interruptValue = current.__interrupt__?.[0]?.value;
console.log("\n── 待确认信息 ──");
console.log("  操作：    ", interruptValue?.actionSummary);
console.log("  当前余额：$" + interruptValue?.currentBalance);
console.log("  转账金额：$" + interruptValue?.transferAmount);
console.log("  预计余额：$" + interruptValue?.afterBalance);

const confirmLine = (await rl.question("\n> ")).trim();
await rl.close();
const done = await graph.invoke(new Command({ resume: confirmLine }), config);

console.log("\n── 最终 State ──");
console.log("  状态：    ", done.status === "confirmed" ? "✅ 已确认" : "❌ 已取消");
console.log("  最终余额：$" + done.balance);

// ─── 思维模型 ──────────────────────────────────────────────
// 把这一切抽象为"转账机"：
//
//   你（外部调度）               转账机（图）
//   ───────────                 ────────
//   塞钱（invoke）               启动 → askAmount 亮灯等你输金额
//   输金额「abc」                啪，红灯亮（非法），回退到 askAmount
//   输金额「200」                绿灯亮 → 打印转账信息 → waitConfirm 亮灯
//   看详情 → 输入「确认」        OK → doTransfer 扣款 → 吐结果
//
//   这不像"调了一个函数"，而像"在跟一台机器交互"
//   机器的状态由 checkpointer 记住，多次 invoke 共享同一个会话
//
// 这就是 Human-in-the-loop 的真实体验：
//   图 = 业务流程的骨架
//   外部调度 = UI 层的交互逻辑
//   Command + __interrupt__ = 两者的通信协议
