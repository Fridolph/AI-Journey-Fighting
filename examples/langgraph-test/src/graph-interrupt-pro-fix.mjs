/**
 * graph-interrupt-pro.mjs 的修复 + 增强版
 *
 * 修复：
 *   ① 空 Command 导致 EmptyInputError → 空输入用占位值兜底
 *   ② 占位符 " " 的坑：Number(" ") == 0 → 误触 skip 分支 → 改为 "__EMPTY__"
 *   ③ confirmLine 空值保护（防止空 Command）
 *
 * 增强（结合 loop-retry 模式）：
 *   ③ 3 次空输入后自动降级跳过
 *      - 外部计数器 emptyCount
 *      - amount=0 作为"跳过"信号
 *      - conditionalEdges 新增 skip 分支 → cancelTransfer
 *      - cancelTransfer 适配 skipped 状态展示
 *
 * 设计思路：
 *   实际业务中"有纰漏总比一直不推进好"——
 *   用户连续 3 次空输入说明卡住了，用 0 作为安全跳过值
 *   让流程能继续走下去，而非无限停在输入环节
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

// ─── ① State 定义 ────────────────────────────────────────────────────
const StateAnnotation = Annotation.Root({
  balance: Annotation({
    reducer: (_prev, next) => next,
    default: () => 500,
  }),
  amount: Annotation({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  actionSummary: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  userInput: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  status: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

// ─── ② askAmount：询问转账金额 ───────────────────────────────────────
// ★ 改动：校验条件从 amount <= 0 改为 amount < 0
//   amount=0 作为"跳过"信号，不再被当成非法值
const askAmount = (state) => {
  const input = interrupt({
    hint: "请输入转账金额（$1 ~ $500）",
    currentBalance: state.balance,
  });

  const amount = Number(String(input).trim());

  // 原版：isNaN(amount) || amount <= 0 → 不合法
  // 新版：isNaN(amount) || amount < 0  → 0 是合法跳过信号
  if (isNaN(amount) || amount < 0 || amount > state.balance) {
    console.log(`\n⚠️  输入不合法「${input}」，请检查输入值（需在 $1 ~ $${state.balance} 之间）`);
    return { amount: -1 };
  }

  return { amount };  // amount=0 也会走到这里
};

// ─── ③ showTransfer：展示转账信息 ────────────────────────────────────
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

// ─── ④ waitConfirm：interrupt 暂停，等用户确认 ───────────────────────
const waitConfirm = (state) => {
  const text = interrupt({
    hint: '输入「确认」执行转账，输入其他内容取消',
    actionSummary: state.actionSummary,
    currentBalance: state.balance,
    transferAmount: state.amount,
    afterBalance: state.balance - state.amount,
  });

  return { userInput: String(text).trim() };
};

// ─── ⑤ doTransfer：执行扣款 ──────────────────────────────────────────
const doTransfer = (state) => {
  const newBalance = state.balance - state.amount;
  console.log("\n✅ 转账成功！");
  console.log("  转账金额：$" + state.amount);
  console.log("  扣款前余额：$" + state.balance);
  console.log("  扣款后余额：$" + newBalance);
  return { balance: newBalance, status: "confirmed" };
};

// ─── ⑥ cancelTransfer：取消转账 ─────────────────────────────────────
// ★ 改动：区分"主动取消"和"自动跳过"
//   主动取消 → ❌ cancelled
//   自动跳过 → ⏭️ skipped（3 次空输入后触发）
const cancelTransfer = (state) => {
  if (state.amount === 0) {
    console.log("\n⏭️  已自动跳过（3 次未输入有效金额）");
    console.log("  余额保持不变：$" + state.balance);
    return { status: "skipped" };
  }
  console.log("\n❌ 转账已取消。");
  console.log("  余额保持不变：$" + state.balance);
  console.log("  你的输入：「" + state.userInput + "」");
  return { status: "cancelled" };
};

// ─── ⑦ 组装图 ────────────────────────────────────────────────────────
// ★ 改动：conditionalEdges 从二路（valid/invalid）变为三路（valid/skip/invalid）
//   amount > 0 → valid → showTransfer → waitConfirm → ...
//   amount = 0 → skip  → cancelTransfer → END（跳过，不经过 waitConfirm）
//   amount < 0 → invalid → askAmount（回边重问）
const graph = new StateGraph(StateAnnotation)
  .addNode("askAmount",      askAmount)
  .addNode("showTransfer",   showTransfer)
  .addNode("waitConfirm",    waitConfirm)
  .addNode("doTransfer",     doTransfer)
  .addNode("cancelTransfer", cancelTransfer)
  .addEdge(START, "askAmount")
  // ★ 三路分支
  .addConditionalEdges("askAmount", (state) =>
    state.amount > 0 ? "valid" : state.amount === 0 ? "skip" : "invalid",
    {
      valid:   "showTransfer",
      skip:    "cancelTransfer",   // ← 新增：amount=0 → 直接跳取消
      invalid: "askAmount",
    }
  )
  .addEdge("showTransfer", "waitConfirm")
  .addConditionalEdges("waitConfirm", (state) => state.userInput === "确认" ? "confirmed" : "cancelled", {
    confirmed: "doTransfer",
    cancelled: "cancelTransfer",
  })
  .addEdge("doTransfer",     END)
  .addEdge("cancelTransfer", END)
  .compile({ checkpointer: new MemorySaver() });

// ─── ⑧ 导出 Mermaid ──────────────────────────────────────────────────
const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({ withStyles: true });
console.log("\n── Mermaid 图结构 ──");
console.log(mermaid);

// ─── ⑨ 运行（修复 + 增强版调度） ─────────────────────────────────────
const config = { configurable: { thread_id: "interrupt-demo" } };
const rl = createInterface({ input: process.stdin, output: process.stdout });

// 第1次 invoke：跑到 askAmount 的 interrupt 暂停
let current = await graph.invoke({}, config);
console.log("\n提示：", current.__interrupt__?.[0]?.value?.hint);
console.log("当前余额：$" + current.__interrupt__?.[0]?.value?.currentBalance);

// ★ 增强：结合 loop-retry 做降级跳过
//   emptyCount：连续空输入计数器（类比 loop-retry 的 tries）
//   空输入 < 3 次 → 占位" " → 回边重问
//   空输入 ≥ 3 次 → resume "0" → skip 分支 → cancelTransfer
let emptyCount = 0;

while (current.__interrupt__?.[0]?.value?.hint?.includes("转账金额")) {
  const raw = (await rl.question("> ")).trim();

  if (!raw) {
    emptyCount++;
    if (emptyCount >= 3) {
      // 第 3 次空输入 → 自动降级跳过
      console.log(`\n⚠️  已连续 ${emptyCount} 次空输入，自动跳过转账`);
      current = await graph.invoke(new Command({ resume: "0" }), config);
      break;  // 跳出 while，进入后续流程
    }
    // 未满 3 次 → 继续重问
    // 用 __EMPTY__ 而非空格：Number(" ") == 0 会误触 skip 分支
    console.log(`  ⚠️ 空输入（${emptyCount}/3），请输入有效金额`);
    current = await graph.invoke(new Command({ resume: "__EMPTY__" }), config);
  } else {
    emptyCount = 0;  // 正常输入 → 重置计数器
    current = await graph.invoke(new Command({ resume: raw }), config);
  }

  if (current.__interrupt__?.[0]?.value?.hint?.includes("转账金额")) {
    console.log("\n提示：", current.__interrupt__?.[0]?.value?.hint);
    console.log("当前余额：$" + current.__interrupt__?.[0]?.value?.currentBalance);
  }
}

// ★ 只有非跳过流程才进入确认阶段
//   跳过流程（amount=0）已在 cancelTransfer 结束，current 不含 __interrupt__
if (current.__interrupt__?.[0]?.value?.hint?.includes("确认")) {
  const interruptValue = current.__interrupt__?.[0]?.value;
  console.log("\n── 待确认信息 ──");
  console.log("  操作：    ", interruptValue?.actionSummary);
  console.log("  当前余额：$" + interruptValue?.currentBalance);
  console.log("  转账金额：$" + interruptValue?.transferAmount);
  console.log("  预计余额：$" + interruptValue?.afterBalance);
  console.log("  提示：    ", interruptValue?.hint);

  const confirmLine = (await rl.question("\n> ")).trim();
  await rl.close();

  if (!confirmLine) {
    console.error("\n未输入，退出。");
    process.exit(1);
  }

  const done = await graph.invoke(new Command({ resume: confirmLine }), config);
  console.log("\n── 最终 State ──");
  console.log("  状态：    ", done.status === "confirmed" ? "✅ 已确认" : "❌ 已取消");
  console.log("  最终余额：$" + done.balance);
} else {
  await rl.close();
  // 跳过流程已完成，直接输出最终 state
  console.log("\n── 最终 State ──");
  console.log("  状态：    ⏭️ 已跳过（" + current.status + "）");
  console.log("  最终余额：$" + current.balance);
}
