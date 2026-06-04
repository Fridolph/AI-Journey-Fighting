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
    default: () => 0,          // 改为 0，等用户输入
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
const askAmount = (state) => {
  const input = interrupt({
    hint: "请输入转账金额（$1 ~ $500）",
    currentBalance: state.balance,
  });

  const amount = Number(String(input).trim());

  if (isNaN(amount) || amount <= 0 || amount > state.balance) {
    console.log(`\n⚠️  输入不合法「${input}」，请检查输入值（需在 $1 ~ $${state.balance} 之间）`);
    return { amount: -1 };
  }

  return { amount };
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
const cancelTransfer = (state) => {
  console.log("\n❌ 转账已取消。");
  console.log("  余额保持不变：$" + state.balance);
  console.log("  你的输入：「" + state.userInput + "」");
  return { status: "cancelled" };
};

// ─── ⑦ 组装图 ────────────────────────────────────────────────────────
const graph = new StateGraph(StateAnnotation)
  .addNode("askAmount",      askAmount)
  .addNode("showTransfer",   showTransfer)
  .addNode("waitConfirm",    waitConfirm)
  .addNode("doTransfer",     doTransfer)
  .addNode("cancelTransfer", cancelTransfer)
  .addEdge(START, "askAmount")
  .addConditionalEdges("askAmount", (state) => state.amount > 0 ? "valid" : "invalid", {
    valid:   "showTransfer",
    invalid: "askAmount",      // 回边：非法 → 重新问
  })
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

// ─── ⑨ 运行 ──────────────────────────────────────────────────────────
const config = { configurable: { thread_id: "interrupt-demo" } };
const rl = createInterface({ input: process.stdin, output: process.stdout });

// 第1次 invoke：跑到 askAmount 的 interrupt 暂停
let current = await graph.invoke({}, config);
console.log("\n提示：", current.__interrupt__?.[0]?.value?.hint);
console.log("当前余额：$" + current.__interrupt__?.[0]?.value?.currentBalance);

// 循环处理金额输入（非法时一直重问）
while (current.__interrupt__?.[0]?.value?.hint?.includes("转账金额")) {
  const amountLine = (await rl.question("> ")).trim();
  current = await graph.invoke(new Command({ resume: amountLine }), config);

  // 如果还在 askAmount（非法输入），继续循环
  if (current.__interrupt__?.[0]?.value?.hint?.includes("转账金额")) {
    console.log("\n提示：", current.__interrupt__?.[0]?.value?.hint);
    console.log("当前余额：$" + current.__interrupt__?.[0]?.value?.currentBalance);
  }
}

// 到这里说明金额合法，current 是 waitConfirm 的暂停
const interruptValue = current.__interrupt__?.[0]?.value;
console.log("\n── 待确认信息 ──");
console.log("  操作：    ", interruptValue?.actionSummary);
console.log("  当前余额：$" + interruptValue?.currentBalance);
console.log("  转账金额：$" + interruptValue?.transferAmount);
console.log("  预计余额：$" + interruptValue?.afterBalance);
console.log("  提示：    ", interruptValue?.hint);

// 等用户输入「确认」或其他
const confirmLine = (await rl.question("\n> ")).trim();
await rl.close();

// 第N次 invoke：resume 确认，图跑完
const done = await graph.invoke(new Command({ resume: confirmLine }), config);

console.log("\n── 最终 State ──");
console.log("  状态：    ", done.status === "confirmed" ? "✅ 已确认" : "❌ 已取消");
console.log("  最终余额：$" + done.balance);