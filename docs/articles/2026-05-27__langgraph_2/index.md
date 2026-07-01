---
title: 「LangGraph 学习路径」中：记忆与暂停 — 让图成为有状态服务
published: 2026-05-27
tags: [LangGraph, Agent, Checkpointer, interrupt, Human-in-the-loop]
category: AI
---

> 📌 **系列简介**：「LangGraph 学习路径」共三篇。上篇讲了三原语（State/Node/Edge）和图的三种形状（线/树/环），本篇讲怎么让图"记住东西"和"停下来等人"。
> ⏱️ **预计阅读时间：18 分钟**
> 💻 **代码仓库**：[AI-Journey-Fighting/examples/langgraph-test](https://github.com/Fridolph/AI-Journey-Fighting/tree/main/examples/langgraph-test)

---

# 记忆与暂停：让图成为有状态服务

## 🗺️ 系列导航

| 篇 | 主题 | 核心能力 |
|----|------|---------|
| 上篇 | State · Node · Edge + 条件路由 + 回边 | 从零搭图 |
| **中篇（本篇）** | **Checkpointer · interrupt · Human-in-the-loop** | **记忆与暂停** |
| 下篇 | ToolNode · createReactAgent · Supervisor | Agent 与多智能体 |

---

## 📖 读这篇，你可以带走什么

| # | 你会学到 | 对应概念 |
|---|---------|---------|
| 1 | Checkpointer 把"无状态函数"变成"有状态服务" | checkpointer-memory |
| 2 | thread_id 如何实现会话隔离 | 多用户状态隔离 |
| 3 | interrupt() + Command 的双向通道 | graph-interrupt |
| 4 | 一个完整转账业务的实战写法 | graph-interrupt-pro |
| 5 | 3 个踩坑实录 | EmptyInputError / 占位符陷阱 / 降级跳过 |

---

## 写在前面

上篇搭的三个图有个共同问题：**每次 invoke 都是从零开始。** 调一次，跑一次，忘了。

真实世界的 Agent 不能这样——聊天机器人得记住上一句说了什么，审批流程得记住卡在哪个环节，多轮表单得记住前面填了什么。

这篇讲两个让图"有记忆、能暂停"的能力，再串成一个完整的转账业务实战。

---

## 一、Checkpointer：从"无状态函数"到"有状态服务"

### 问题

```js
// 没有 checkpointer
await graph.invoke({ visitCount: 0 }); // visitCount: 1
await graph.invoke({ visitCount: 0 }); // visitCount: 1 ← 又回到 1！
```

每次 invoke 都得手动传初始值，两次调用之间没法"记住"上一次的结果。

### 解决：compile 时注入 checkpointer

```js
import { MemorySaver } from "@langchain/langgraph";

const checkpointer = new MemorySaver();
const app = graph.compile({ checkpointer });  // ← 多了这个参数

// 同一个 thread_id 的多次 invoke，visitCount 持续累加
const user1 = { configurable: { thread_id: "用户-小张" } };
await app.invoke({}, user1); // visitCount: 1
await app.invoke({}, user1); // visitCount: 2
await app.invoke({}, user1); // visitCount: 3

// 不同 thread_id 互不干扰
const user2 = { configurable: { thread_id: "用户-小李" } };
await app.invoke({}, user2); // visitCount: 1 ← 从头开始！
```

**五个新要素：**

| 要素 | 是什么 | 前端类比 |
|------|--------|---------|
| `MemorySaver` | 进程内 Map，key=thread_id, value=State[] | `new Map()` |
| `compile({ checkpointer })` | 告诉 LangGraph "每次执行完存档" | `configureStore({ middleware: persist })` |
| `thread_id` | 会话身份证 | session 的 `sessionId` |
| `invoke(state, config)` | 第二个参数传入会话标识 | `dispatch(action, { session })` |
| 跨 invoke 持久化 | 下一次 invoke 从上次存档开始 | `localStorage.getItem(key)` |

**MemorySaver 内部就是一个 Map：**

```js
// 伪代码
Map {
  "用户-小张" → [{ visitCount: 1 }, { visitCount: 2 }, { visitCount: 3 }]
  "用户-小李" → [{ visitCount: 1 }]
}
```

每次节点执行结束，引擎自动调 `save()` 写入当前 State。下次 invoke 同一个 thread_id，先调 `load()` 恢复上次存档。

**关键洞察：** MemorySaver 把快照存内存里，**进程重启就丢了**。生产环境要用 SqliteSaver（存磁盘），但原理和接口完全一样——这是依赖倒置原则的一个好例子。

---

## 二、interrupt：让图在中间停下来等你

### 从自动执行到人工介入

前面的图都是"点火 → 自动跑完"。但转账需要审批、表单需要确认——这些都需要人来做判断。

```js
import { Command, interrupt } from "@langchain/langgraph";

const waitConfirm = (state) => {
  // ★ 向外抛 + 向内收的双向通道
  const text = interrupt({
    hint: "输入「确认」执行转账，输入其他内容取消",
    actionSummary: state.actionSummary,
  });
  return { userInput: String(text) };
};

// 第一次 invoke：停在 interrupt
const paused = await app.invoke({}, config);
// paused.__interrupt__[0].value = { hint: "...", actionSummary: "..." }

// 用户输入后，第二次 invoke：恢复执行
const done = await app.invoke(new Command({ resume: "确认" }), config);
// done.userInput = "确认"
```

### interrupt = async Generator 的 yield

如果你写过 Generator，这个模式应该很熟悉：

```js
// Generator 版
function* transferFlow() {
  const summary = "向张三转账 ¥100";
  const text = yield { hint: "请输入确认", summary };  // 暂停
  return { userInput: text };                           // 恢复后继续
}

const gen = transferFlow();
gen.next();              // { value: { hint, summary }, done: false }
gen.next("确认");        // { value: { userInput: "确认" }, done: true }
```

LangGraph 版就是把这个模式用在了图编排里——**同步的写法，底层的异步。**

### interrupt 必须配合 checkpointer

没有 checkpointer 的图调用 `interrupt()` 会直接报错。原因很直观：interrupt = 暂停 + 存档。存档需要 checkpointer 来保存"暂停在哪"的上下文。

```
checkpointer   → 被动存档：执行完自动保存
interrupt      → 主动冻结：在指定节点存档后暂停，等 resume
```

---

## 三、实战：一个完整的转账业务

下面把前面学到的 concepts 串起来，做一个可交互的转账 demo：

```
                        ┌──valid──→ showTransfer → waitConfirm ──confirmed──→ doTransfer → END
START → askAmount ─────┤                                              │
           ↑            │                                   cancelled → cancelTransfer → END
           └──invalid──┘

     ① interrupt               ② interrupt
     "请输入金额"             "输入确认执行"
```

5 个节点，2 处 interrupt，2 个条件边，1 条回边。

### 节点分工

| 节点 | 类型 | 职责 |
|------|------|------|
| `askAmount` | 输入校验 | ① 暂停等金额输入，② 校验合法性 |
| `showTransfer` | 纯展示 | 打印转账详情到终端 |
| `waitConfirm` | 审批确认 | ② 暂停等用户确认/取消 |
| `doTransfer` | 执行 | 扣减余额 |
| `cancelTransfer` | 执行 | 保持余额 |

### 两条条件边

```js
// askAmount 之后：三路分支
.addConditionalEdges("askAmount", (state) =>
  state.amount > 0 ? "valid" : state.amount === 0 ? "skip" : "invalid", {
    valid:   "showTransfer",       // > 0 → 正常流程
    skip:    "cancelTransfer",     // = 0 → 跳过
    invalid: "askAmount",          // < 0 → 回边重问
})

// waitConfirm 之后：确认或取消
.addConditionalEdges("waitConfirm", (state) =>
  state.userInput === "确认" ? "confirmed" : "cancelled", {
    confirmed: "doTransfer",
    cancelled: "cancelTransfer",
})
```

### 外部调度的三段式

```js
// 段①：点火 → 自动跑到第一个中断点
let current = await graph.invoke({}, config);

// 段②：循环 → 反复处理输入（非法时回到 askAmount）
while (current.__interrupt__?.[0]?.value?.hint?.includes("转账金额")) {
  const amountLine = await rl.question("> ");
  current = await graph.invoke(new Command({ resume: amountLine }), config);
}

// 段③：确认 → 展示详情，等用户最终决定
const confirmLine = await rl.question("> ");
const done = await graph.invoke(new Command({ resume: confirmLine }), config);
```

图定义"怎么流转"，外部调度定义"什么时候 invoke、resume 什么值"。两者通过 `Command` 和 `__interrupt__` 对话——这种分离让同一个图可以对接到终端、Web UI、API 等多种前端。

---

## 四、踩坑实录

### 空 Command → EmptyInputError

用户直接在提示处按回车 → `Command({ resume: "" })` → LangGraph 引擎 `PregelLoop` 检查 `writes` 为空 → 崩溃。

`Command.resume` 的值必须在任何时候都非空。三层防护：

| 层级 | 校验什么 | 做了什么 |
|------|---------|---------|
| 框架层 | `writes` 是否为空 | 拒绝 → EmptyInputError |
| 业务层 | 金额是否合法 | 走 invalid 回边 → 重问 |
| 调度层 | 输入是否为空 | **兜底：空 → 非法占位符** |

调度层的空值保护是最外层防线，不能依赖业务节点来处理。

### 占位符的陷阱：`Number(" ") === 0`

用空格 `" "` 做空输入占位符 → `Number(" ")` 在 JS 里返回 **0** 而不是 NaN。这导致空输入被误判为**合法的跳过值**，直接走 cancelTransfer 分支。

```js
Number(" ");       // → 0  ← 不是 NaN！
Number("");        // → 0  ← 空串也是 0！
Number("abc");     // → NaN ← 这才触发 invalid 回边
```

**占位符必须选 `Number()` 无法解析的值**，比如 `"__EMPTY__"`。

### 降级跳过：结合 retry 做 3 次空输入自动跳过

空输入一直重问也不友好。实际业务应该"有纰漏总比一直不推进好"——3 次空输入后自动跳过。这是 loop-retry 的"计数器 + 终止条件"模式直接移植到外部调度层：

```js
let emptyCount = 0;
if (!raw) {
  emptyCount++;
  if (emptyCount >= 3) {
    // 3 次 → resume "0" → amount=0 → skip → cancelTransfer
    current = await graph.invoke(new Command({ resume: "0" }), config);
    break;
  }
  current = await graph.invoke(new Command({ resume: "__EMPTY__" }), config);
}
```

---

## 五、前端对照表

| LangGraph | 前端 |
|-----------|------|
| `compile({ checkpointer })` | `configureStore({ middleware })` |
| `thread_id` | `sessionStorage` 的 key |
| `MemorySaver` | `new Map<string, State[]>()` |
| `interrupt()` | `async Generator` 的 `yield` |
| `Command({ resume })` | `generator.next(value)` |
| 外部调度 `while` 循环 | 表单校验 + 重试的交互逻辑 |
| `__interrupt__` | WebSocket 推送给前端的"我在等你"消息 |

---

## 下一篇

中篇让图有了"记忆"和"暂停"。但到目前为止，所有的业务逻辑都是我们硬编码的——正则判断路由、if/else 做校验。

**下篇引入 LLM：让 AI 来决定什么时候调工具、什么时候该结束了。再往上，多个 Agent 各自带自己的 tools，由一个 Supervisor 调度协作。** 这才是"Agent"这个词真正的含义。
