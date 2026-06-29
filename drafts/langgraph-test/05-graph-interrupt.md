# 05 — graph-interrupt.mjs：Human-in-the-Loop

> 学习日期：2026-05-21
> 原始文件：`examples/langgraph-test/src/graph-interrupt.mjs`

---

## 一、学习目标

- 理解 `interrupt()` + `Command` 实现**图内暂停 → 等待外部输入 → 恢复执行**
- 掌握 Human-in-the-Loop 的核心模式：审批确认、调试断点、多轮交互
- 理解为什么 interrupt 必须和 checkpointer 配合使用

---

## 二、与 checkpointer 的关系

| 篇 | 做了什么 | checkpointer 的角色 |
|----|---------|---------------------|
| 04 checkpointer-memory | 跨 invoke 自动记住状态 | **被动存档**：每次节点执行完自动保存 |
| 05 graph-interrupt | 跨 invoke 暂停等输入 | **主动冻结**：在 interrupt 处存档冻结，等 resume 后恢复 |

**一句话：interrupt 能工作，是因为 checkpointer 在底下撑着。**

没有 checkpointer 的图调用 `interrupt()` 会直接报错。你可以把 interrupt 想象成游戏里的"暂停 + 存档"——在关键节点停下来，用 checkpointer 把当前状态写到存档，等外部指令再读档继续。

---

## 三、逐层拆解

### 3.1 两个新面孔

```js
import { Command, interrupt } from "@langchain/langgraph";
```

| 新 API | 作用 | 执行位置 |
|--------|------|---------|
| `interrupt({ hint, ... })` | 在节点内**暂停**图执行，把控制权交还给外部调用者 | **节点函数内部** |
| `new Command({ resume: value })` | **恢复**暂停的图，value 会成为 `interrupt()` 的返回值 | **第二次 invoke 的入参** |

### 3.2 interrupt — 双向通道

```js
const waitConfirm = (state) => {
  // ★ 向外抛：{ hint, actionSummary } → 给外部调用者看
  // ★ 向内收：Command({ resume: x }) → text = x
  const text = interrupt({
    hint: "终端里输入「确认」或备注后回车",
    actionSummary: state.actionSummary,
  });
  return { userInput: String(text) };
};
```

`interrupt()` 是一个**双向通道**：

```
      向外抛（给调用者看）
      ┌─────────────────┐
      │ hint             │
      │ actionSummary    │ → 第一次 invoke 返回值中的 __interrupt__
      └──────┬──────────┘
             │
             ▼
        interrupt()
             ▲
      ┌──────┴──────────┐
      │ text             │ ← 第二次 invoke 时 Command({ resume: x }) 的 x
      └─────────────────┘
      向内收（从调用者接）
```

**前端类比：`async Generator` + `yield`**

```js
// Generator 版
function* transferFlow() {
  const summary = "向张三转账 ¥100";
  // yield = 暂停，抛出值给外部，等外部传回值
  const text = yield { hint: "请输入确认", actionSummary: summary };
  return { userInput: text };
}

const gen = transferFlow();
const step1 = gen.next();          // { value: { hint, actionSummary }, done: false }
//                                ← 暂停
const step2 = gen.next("确认");     // { value: { userInput: "确认" }, done: true }
```

`interrupt()` 和 `yield` 的行为几乎完全一致：
- 第一次 `invoke` → 走到 `interrupt()` → 抛出信息 → 暂停 → 返回 `__interrupt__`
- 外部读取 `__interrupt__` → 做决策 → 第二次 `invoke(Command({ resume: x }))` → 值注入到 `interrupt()` 的返回值位置

### 3.3 两次 invoke 的完整流程

```
invoke(1) ──► showTransfer ──► waitConfirm ──► interrupt({hint, actionSummary})
                                         │
                                         │  图在此暂停
                                         │
                                         ▼
                           返回 { __interrupt__: [{ hint, actionSummary }] }

                                    外部读取 __interrupt__
                                    等待用户输入...

    用户输入 "确认"

invoke(2) ──► Command({ resume: "确认" }) ──► waitConfirm 恢复
                                          │   text = "确认"
                                          │   userInput = "确认"
                                          │
                                          ▼
                                     END
                                    返回 { actionSummary: "向张三转账 ¥100", userInput: "确认" }
```

### 3.4 `__interrupt__` 对象

第一次 `invoke` 返回的不是正常的 State，而是一个带有特殊属性的对象：

```js
const paused = await graph.invoke({}, config);
// paused 不是一个"执行完成的结果"
// 而是一个"暂停报告"

console.log(paused.__interrupt__?.[0]?.value);
// 输出：
// {
//   hint: '终端里输入「确认」或备注后回车，图才会继续',
//   actionSummary: '向张三转账 ¥100（模拟，不会真扣款）'
// }
```

| 属性 | 是什么 |
|------|--------|
| `__interrupt__` | 图暂停时携带的信息数组 |
| `__interrupt__[0].value` | `interrupt()` 调用时传入的完整参数对象 |

**前端类比：** 就像 `Promise` 从 `pending` 变成了一个特殊状态——告诉你"我没完成，但我有消息给你看"。

---

## 四、Mermaid 图解读

```
graph TD;
  __start__([__start__])
  showTransfer(showTransfer)
  waitConfirm(waitConfirm)
  __end__([__end__])
  __start__ --> showTransfer;
  showTransfer --> waitConfirm;
  waitConfirm --> __end__;
```

这张图是**线性**的，看起来和 basic-graph 没区别。关键的区别不在图的结构里，而在 `waitConfirm` 节点的**内部实现**——它调用了 `interrupt()`。

这揭示了 LangGraph 的一个重要设计原则：**图拓扑决定"数据流向"，节点内部实现决定"执行行为"**。interrupt 是一个"行为级"的暂停，不是"结构级"的——图结构看不出这里会停。

---

## 五、运行验证

```bash
# 非交互式测试：echo 管道输入 "确认"
cd examples/langgraph-test
echo "确认" | node src/graph-interrupt.mjs

# 交互式测试（手动输入）
cd examples/langgraph-test
node src/graph-interrupt.mjs
# 等待 > 提示符，输入内容后回车
```

**预期输出（非交互测试）：**

```
%%{init: {...}}%%
graph TD;
  __start__([__start__]):::first
  showTransfer(showTransfer)
  waitConfirm(waitConfirm)
  __end__([__end__]):::last
  __start__ --> showTransfer;
  showTransfer --> waitConfirm;
  waitConfirm --> __end__;

待你确认： {
  hint: '终端里输入「确认」或备注后回车，图才会继续',
  actionSummary: '向张三转账 ¥100（模拟，不会真扣款）'
}
> 结果： { actionSummary: '向张三转账 ¥100（模拟，不会真扣款）', userInput: '确认' }
```

---

## 六、核心洞察

### 🔑 interrupt = 声明式的 yield

LangGraph 把 Generator 的 `yield` 模式用到了图编排里：

| Generator | LangGraph interrupt | 说明 |
|-----------|-------------------|------|
| `yield value` | `interrupt({...})` | 暂停，抛信息给外部 |
| `generator.next()` | `invoke(state, config)` | 第一次启动/下一次恢复 |
| `generator.next(x)` | `invoke(Command({ resume: x }), config)` | 第二次注入值 |
| `yield` 的返回值 | `interrupt()` 的返回值 | 外部注入进来的值 |

这种模式比回调/Promise 更直观的原因：**开发者用同步的写法来管理异步的暂停点**。

```js
// 回调噩梦
function transferFlow(callback) {
  const summary = "向张三转账 ¥100";
  showMessage(summary, (userInput) => {
    callback({ userInput });
  });
}

// interrupt = 同步写法，底层异步
const text = interrupt({ hint: "请输入确认" });
// 像是同步的，但实际是分两段 invoke 完成的
```

### 🔑 没有 checkpointer → interrupt 报错

```js
// ❌ 会报错
compile()  // 没有 checkpointer
// node 内调 interrupt → Error!

// ✅ 正常工作
compile({ checkpointer: new MemorySaver() })
// interrupt + checkpointer 才是完整能力
```

为什么？因为 interrupt 本质上是在编程过程保存"断点"。**checkpointer 保存的是"停在哪"的上下文**。如果没有存档能力，暂停位置的信息就丢了。

### 🔑 Human-in-the-Loop 的两个典型场景

**场景 1：审批确认（本例）**

```
showTransfer → waitConfirm(interrupt) → 等审批人 → resume → 转账
```

这个场景在审批流、订单确认、人工审核中非常常见。LangGraph 把"人工介入"变成了图中的一个节点，和其他节点没有结构上的区别。

**场景 2：调试断点**

```
stepX → interrupt({ state }) → 检查 State → resume → 继续
```

开发时在关键节点插入 `interrupt({ state })`，invoke 后检查 State 是否符合预期。这是 **repl（Read-Eval-Print-Loop）式调试**——不是打日志，而是在执行中间停下来交互式检查。

---

## 七、学习注释版

```
examples/langgraph-test/src/graph-interrupt-learning.mjs
```

原始文件保持不变，学习版添加了：
- `interrupt` vs `yield` 的 Generator 类比
- 两次 invoke 的完整追踪
- 没有 checkpointer 为什么会报错的解释

---

## 八、下一步预告

`graph-interrupt-pro.mjs` — interrupt 进阶：

- **多轮交互**：输入金额 → 校验 → 不满条件中断重来（回边 + interrupt 组合）
- **条件恢复**：根据 resume 的值走不同分支
- **动态中断**：在 `addNode` 时声明中断点，而不是在节点内写 `interrupt()`——这是面向生产的用法

---

## 附：如果第二次 invoke 不传 Command 会怎样？

```js
// 在终端交互时按 Ctrl+C 不输入 → 图处于"挂起"状态
const paused = await graph.invoke({}, config);
// 此时图已暂停在 waitConfirm

// 如果再次 invoke 同一个 thread_id 但不传 Command：
const again = await graph.invoke({}, config);
// 结果：又返回 __interrupt__（同一个暂停点再次暂停）
// 不会怎样，但也没有继续前进
```

所以 `Command({ resume: x })` 和普通 invoke 的区别就在这个 `Command` 包装——**没有 Command 就是"再暂停一次"，有 Command 才是"恢复继续"**。
