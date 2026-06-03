# LangGraph 学习笔记（三）：interrupt 暂停机制

> 衔接上篇：已理解 State / Node / Edge / Checkpointer / MessagesAnnotation
> 本篇目标：掌握 interrupt 暂停机制——图的「暂停键」

## 一、使用场景

> 图执行到某个节点时，需要**等待人类输入**才能继续。
> 典型场景：支付确认、危险操作二次确认、人工审核。

## 二、完整示例

```js
import {
  Annotation, Command, END, MemorySaver,
  START, StateGraph, interrupt,
} from "@langchain/langgraph"

const StateAnnotation = Annotation.Root({
  actionSummary: Annotation({ reducer: (_prev, next) => next, default: () => "" }),
  userInput:     Annotation({ reducer: (_prev, next) => next, default: () => "" }),
})

/** 普通节点：准备数据 */
const showTransfer = () => ({
  actionSummary: "向张三转账 ¥100（模拟，不会真扣款）",
})

/** 暂停节点：等待人类输入 */
const waitConfirm = (state) => {
  const text = interrupt({
    hint: "输入「确认」或备注后回车，图才会继续",
    actionSummary: state.actionSummary,
  })
  return { userInput: String(text) }
}

const graph = new StateGraph(StateAnnotation)
  .addNode("showTransfer", showTransfer)
  .addNode("waitConfirm",  waitConfirm)
  .addEdge(START, "showTransfer")
  .addEdge("showTransfer", "waitConfirm")
  .addEdge("waitConfirm", END)
  .compile({ checkpointer: new MemorySaver() })  // ⚠️ interrupt 必须有 checkpointer

const config = { configurable: { thread_id: "interrupt-demo" } }

// 第一次 invoke：图跑到 interrupt() 处暂停
const paused = await graph.invoke({}, config)
console.log("待确认：", paused.__interrupt__?.[0]?.value)

// ... 等待用户输入 ...

// 第二次 invoke：传入 resume，从断点继续
const done = await graph.invoke(new Command({ resume: userInput }), config)
```

## 三、执行流程图

```
第一次 invoke({}, config)
  ↓
[showTransfer] → 写入 actionSummary
  ↓
[waitConfirm] → 执行到 interrupt() → ⏸️ 冻结！
  ↓
返回 { __interrupt__: [{ value: { hint, actionSummary } }] }

（程序等待用户输入...）

第二次 invoke(new Command({ resume: "确认" }), config)
  ↓
从 waitConfirm 断点处恢复
  ↓
interrupt() 返回值 = "确认"
  ↓
return { userInput: "确认" }
  ↓
END ✅
```

## 四、关键概念解析

| 概念 | 说明 |
|------|------|
| `interrupt(value)` | 暂停图执行，value 作为暂停信息返回给调用方 |
| `__interrupt__` | 第一次 invoke 返回值里的暂停信息 |
| `Command({ resume })` | 第二次 invoke 的参数，resume 值会成为 interrupt() 的返回值 |
| `checkpointer` | **必须有**，用于保存冻结的 state，resume 时恢复 |
| `thread_id` | **两次 invoke 必须相同**，才能找到同一个断点 |

## 五、前端类比

```js
// interrupt 就像 await 一个外部 Promise：
const waitForUser = () => new Promise(resolve => {
  button.onclick = () => resolve(input.value)
})

const text = await waitForUser()  // ← 对应 interrupt()
//                                    resume 对应 resolve(用户输入)
```

## 六、为什么必须有 checkpointer？

> interrupt 暂停时，图的完整 state 被「冻结」存入 checkpointer。第二次 invoke 时，通过同一 thread_id 找回冻结 state，从断点继续。没有 checkpointer → 无法保存断点 → interrupt 根本无法工作。

## 七、实战进阶：多 interrupt 转账流程

```js
// 完整流程图：
// START → [askAmount] → ◇ valid? → [showTransfer] → [waitConfirm] → ◇ confirmed? → [doTransfer] → END
//                               └ invalid → 回到 askAmount ↩️                 └ cancelled → [cancelTransfer] → END
```

四个关键节点：

**askAmount**：第一个 interrupt，询问转账金额。非法输入时通过回边重新询问。

```js
const askAmount = (state) => {
  const input = interrupt({
    hint: `请输入转账金额（$1 ~ $${state.balance}）`,
    currentBalance: state.balance,
  });
  const amount = Number(String(input).trim());
  if (isNaN(amount) || amount <= 0 || amount > state.balance) {
    return { amount: -1 };  // 非法值 → 触发回边重问
  }
  return { amount };
};
```

**showTransfer**：展示转账信息预览。

**waitConfirm**：第二个 interrupt，等待用户确认。

```js
const waitConfirm = (state) => {
  const text = interrupt({
    hint: '输入「确认」执行转账，输入其他内容取消',
    actionSummary: state.actionSummary,
    afterBalance: state.balance - state.amount,
  });
  return { userInput: String(text).trim() };
};
```

**doTransfer / cancelTransfer**：执行扣款或取消。

组装图：

```js
const graph = new StateGraph(StateAnnotation)
  .addNode("askAmount",      askAmount)
  .addNode("showTransfer",   showTransfer)
  .addNode("waitConfirm",    waitConfirm)
  .addNode("doTransfer",     doTransfer)
  .addNode("cancelTransfer", cancelTransfer)
  .addEdge(START, "askAmount")
  .addConditionalEdges("askAmount", (state) => state.amount > 0 ? "valid" : "invalid", {
    valid:   "showTransfer",
    invalid: "askAmount",       // 回边：非法 → 重新问
  })
  .addEdge("showTransfer", "waitConfirm")
  .addConditionalEdges("waitConfirm", (state) => state.userInput === "确认" ? "confirmed" : "cancelled", {
    confirmed: "doTransfer",
    cancelled: "cancelTransfer",
  })
  .addEdge("doTransfer",     END)
  .addEdge("cancelTransfer", END)
  .compile({ checkpointer: new MemorySaver() });
```

**图结构：**

```
START
  ↓
[askAmount] ⏸️（等待输入金额）
  ↓
◇ valid?
  ├── valid   → [showTransfer] → [waitConfirm] ⏸️（等待确认）
  │                                 ↓
  │                             ◇ confirmed?
  │                               ├── confirmed → [doTransfer] → END ✅
  │                               └── cancelled → [cancelTransfer] → END ❌
  └── invalid → 回到 askAmount ↩️
```

图中包含：
- ✅ 两个 interrupt（金额输入 + 转账确认）
- ✅ 回边（非法金额重问）
- ✅ 条件边（金额验证 + 确认判断）
- ✅ 多个 END 出口（成功 / 取消）

## 八、两种图模式总结

```
模式一：单 interrupt（简单线性 + 暂停）
START → [准备数据] → [interrupt ⏸️] → END

模式二：多 interrupt + 回边（复杂流程）
START → [interrupt ⏸️] → ◇ valid? → [展示] → [interrupt ⏸️] → ◇ confirmed?
                         └ invalid ↩️                                 ├ confirmed → END
                                                                      └ cancelled → END
```
