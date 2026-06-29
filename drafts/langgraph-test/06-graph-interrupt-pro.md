# 06 — graph-interrupt-pro.mjs：实战组合 — 转账流程

> 学习日期：2026-05-21
> 原始文件：`examples/langgraph-test/src/graph-interrupt-pro.mjs`

---

## 一、学习目标

- 理解多个 LangGraph 原语如何**组合**成真实业务流
- 掌握"图定义流转 + 外部调度控制节奏"的生产模式
- 把前 5 篇的能力串联成一条完整的转账链路

---

## 二、basic 版 vs pro 版对比

先看升级了什么：

| 维度 | basic 版 | pro 版 |
|------|---------|--------|
| 节点数 | 2 个 | **5 个** |
| interrupt 数量 | 1 个 | **2 个**（金额输入 + 确认审批） |
| 条件分支 | 无 | **2 组** ConditionalEdges |
| 回边 | 无 | **1 条**（非法金额回到自身） |
| State 字段 | 2 个 | **5 个**（含 balance 追踪） |
| 业务闭环 | 只展示，不执行 | **扣款 / 取消，余额真实变更** |
| 外部调度 | 简单的读→写 | **三段式循环控制** |

basic 版是"Hello World 演示"，pro 版是**可跑的真实业务**。

---

## 三、图拓扑全貌

```
                        ┌──valid──→ showTransfer → waitConfirm ──confirmed──→ doTransfer → END
START → askAmount ─────┤                                              │
           ↑            │                                   cancelled → cancelTransfer → END
           └──invalid──┘
           
     ① interrupt               ② interrupt
    "请输入金额"             "输入确认执行"
```

**5 个节点各司其职：**

| 节点 | 类型 | 职责 | 中断？ |
|------|------|------|--------|
| `askAmount` | 输入校验节点 | ① 暂停等金额输入，② 校验合法性 | ✅ `interrupt()` |
| `showTransfer` | 纯展示节点 | 打印转账详情到终端 | ❌ |
| `waitConfirm` | 审批节点 | ② 暂停等用户确认/取消 | ✅ `interrupt()` |
| `doTransfer` | 执行节点 | 扣减余额，标记 `confirmed` | ❌ |
| `cancelTransfer` | 执行节点 | 保持余额，标记 `cancelled` | ❌ |

**条件边：**

| 起点 | 条件 | 目标 1 | 目标 2 |
|------|------|--------|--------|
| `askAmount` | `amount > 0` | `showTransfer`（合法） | `askAmount`（非法，回边） |
| `waitConfirm` | `userInput === "确认"` | `doTransfer`（确认） | `cancelTransfer`（取消） |

### 完整边表（9 条）

下图拓扑共有 9 条边，每条只关心"从某个节点出来后去哪"：

| # | 类型 | 边 | 说明 |
|---|------|---|------|
| 1 | `addEdge` | `START → askAmount` | 入口，必走 |
| 2 | `addConditionalEdges` (valid) | `askAmount → showTransfer` | 金额合法 |
| 3 | `addConditionalEdges` (skip) | `askAmount → cancelTransfer` | 金额=0（跳过） |
| 4 | `addConditionalEdges` (invalid) | `askAmount → askAmount` | 金额非法（回边） |
| 5 | `addEdge` | `showTransfer → waitConfirm` | 展示后固定进入确认 |
| 6 | `addConditionalEdges` (confirmed) | `waitConfirm → doTransfer` | 确认转账 |
| 7 | `addConditionalEdges` (cancelled) | `waitConfirm → cancelTransfer` | 取消转账 |
| 8 | `addEdge` | `doTransfer → END` | 扣款后结束 |
| 9 | `addEdge` | `cancelTransfer → END` | 取消后结束 |

#### 困惑点：`addEdge` 和 `addConditionalEdges` 是不是重复了？

不是。两者回答的是不同问题：

```
① askAmount ──valid──→ showTransfer      ← "askAmount 之后可能去哪？"
②                         showTransfer ──────→ waitConfirm  ← "showTransfer 之后一定去哪？"
```

- 第 2 条是 **askAmount 的出口**：根据 amount 值三选一（条件路由）
- 第 5 条是 **showTransfer 的出口**：固定走 waitConfirm（线性路由）

`showTransfer` 同时出现在第 2 条（**被指向**）和第 5 条（**指向别人**）——这是两个不同的角色。

前端类比：

```js
// 第 2 条 = 调用方决定调哪个组件
switch (amount) {
  case > 0: render(<ShowTransfer />); break;    // askAmount → showTransfer
  case 0:   render(<CancelTransfer />); break;   // askAmount → cancelTransfer
}

// 第 5 条 = 组件内部决定下一步去哪
function ShowTransfer() {
  // 渲染完成，固定跳转到确认页
  navigateTo('/waitConfirm');   // showTransfer → waitConfirm
}
```

**结论：条件的复用在"从哪个节点出来"这一层，不是"整个路径"。** 每条边只关心"当前节点之后"的事，不关心之前从哪来。

---

## 四、逐层拆解

### 4.1 第①个 interrupt — 金额输入 + 校验

```js
const askAmount = (state) => {
  const input = interrupt({
    hint: "请输入转账金额（$1 ~ $500）",
    currentBalance: state.balance,
  });
  const amount = Number(String(input).trim());

  // 非法 → amount = -1 → 回边 invalid → 回到 askAmount
  if (isNaN(amount) || amount <= 0 || amount > state.balance) {
    return { amount: -1 };   // ← 触发回边的信号值
  }
  return { amount };          // ← 合法，继续
};
```

关键设计模式：**amount = -1 作为"非法标记"**。条件边判断的是 `amount > 0`，而不需要知道具体校验逻辑。校验逻辑封装在节点内部，条件边只管"状态值 → 下一站"。

这和前端的 form validation 完全同理：

```js
// 前端表单校验
if (!isValid) {
  setErrors(...);     // 不提交，让用户重填
  return;
}
submitForm(data);     // 合法，提交

// LangGraph 版
if (!isValid) {
  return { amount: -1 };   // 条件边检测到 -1 → 回到自身
}
return { amount };         // 条件边检测到 >0 → 前往 showTransfer
```

### 4.2 第②个 interrupt — 确认/取消

```js
const waitConfirm = (state) => {
  const text = interrupt({
    hint: '输入「确认」执行转账，输入其他内容取消',
    actionSummary: state.actionSummary,
    currentBalance: state.balance,
    transferAmount: state.amount,
    afterBalance: state.balance - state.amount,  // 提前算好预计余额
  });
  return { userInput: String(text).trim() };
};
```

这里 `interrupt()` 携带了比 basic 版更丰富的信息：
- `actionSummary`：操作描述
- `transferAmount`：转账金额
- `afterBalance`：**转账后的预计余额**（提前算好给外部展示）

外部代码通过 `__interrupt__` 拿到这些信息后展示给用户，让用户看到"转账后余额会变成 X"再决策。这是 Human-in-the-loop 的核心体验——**人看到了足够的信息再做判断**。

### 4.3 回边 + while = 两层互补的循环

```js
// 图内的回边
.addConditionalEdges("askAmount", ..., {
  invalid: "askAmount",  // ← 回到自身
})

// 图外的 while 循环
while (current.__interrupt__?.[0]?.value?.hint?.includes("转账金额")) {
  const amountLine = await rl.question("> ");
  current = await graph.invoke(new Command({ resume: amountLine }), config);
  // 如果还在 askAmount 的 interrupt，继续循环
}
```

**两层循环各管各的：**

| 层级 | 循环类型 | 触发条件 | 职责 |
|------|---------|---------|------|
| 图内 | 条件回边 | `amount > 0` 为 false | 拓扑上不允许跳到 showTransfer |
| 图外 | `while` + readline | State 还在 askAmount 的 interrupt | 交互上不断问用户 |

回边保证**图的拓扑正确**（不会从非法金额跳到 showTransfer），while 保证**交互体验**（用户输错就再问，不退出程序）。两者缺一不可。

### 4.4 外部调度的三段式

```js
// 段①：点火 — 自动跑到第一个暂停点
let current = await graph.invoke({}, config);

// 段②：循环 — 输入校验阶段，可能反复暂停/恢复
while (...) {
  current = await graph.invoke(new Command({ resume: x }), config);
}

// 段③：确认 — 展示详情，等用户最终决定
const done = await graph.invoke(new Command({ resume: y }), config);
```

这是 Human-in-the-Loop 的经典三段式模式：

```
段① ──── 段② ──────────────────── 段③ ────
点火     可能反复的输入校验循环      最终确认
```

每次 `invoke(Command(...))` 都让图**前进一步**——从当前中断点执行到下一个中断点或 END。

可以把这张图想象成一个**状态机 + 步进器**的组合：图内定义"什么条件下走哪条路"，外部调度定义"什么时候走下一步"。

---

## 五、完整执行追踪

```
=== 用户输入非法金额 "abc" ===

invoke({})
  → START → askAmount → interrupt()
  ← 返回 { __interrupt__: { hint: "请输入转账金额" } }
  ↓
  while 检测到 hint 包含 "转账金额" → 进入循环
  ↓
用户输入 "abc"
  invoke(Command({ resume: "abc" }))
  → askAmount 恢复
  → 校验: amount = NaN → amount = -1
  → 条件边: amount > 0? → false → "invalid"
  → 回边 → askAmount → interrupt() 再次暂停
  ← 返回 { __interrupt__: { hint: "请输入转账金额" } }
  ↓
  while 检测到 hint 包含 "转账金额" → 继续循环


=== 用户输入合法金额 "200" ===

用户输入 "200"
  invoke(Command({ resume: "200" }))
  → askAmount 恢复
  → 校验: amount = 200 → 合法
  → 条件边: amount > 0? → true → "valid" → showTransfer
  → 打印转账信息
  → waitConfirm → interrupt()
  ← 返回 { __interrupt__: { hint: "输入「确认」执行转账", transferAmount: 200, ... } }
  ↓
  while 检测到 hint 不包含 "转账金额" → 退出循环


=== 用户确认"确认" ===

用户输入 "确认"
  invoke(Command({ resume: "确认" }))
  → waitConfirm 恢复 → userInput = "确认"
  → 条件边: userInput === "确认"? → true → "confirmed" → doTransfer
  → 扣款: balance 500 → 300
  → END
  ← 返回 { balance: 300, status: "confirmed", ... }
```

---

## 六、运行验证

```bash
# 交互式运行
cd examples/langgraph-test
node src/graph-interrupt-pro.mjs
```

**预期交互过程：**

```
── Mermaid 图结构 ──
graph TD;
  __start__ --> askAmount;
  askAmount -. valid .-> showTransfer;
  askAmount -. invalid .-> askAmount;   ← 回边！
  showTransfer --> waitConfirm;
  waitConfirm -. confirmed .-> doTransfer;
  waitConfirm -. cancelled .-> cancelTransfer;

提示： 请输入转账金额（$1 ~ $500）
当前余额：$500
> abc                        ← 故意输错

⚠️  输入不合法「abc」...

提示： 请输入转账金额（$1 ~ $500）
> 200                        ← 合法金额

── 待确认信息 ──
  操作：     向张三转账 $200（当前余额 $500）
  当前余额：$500
  转账金额：$200
  预计余额：$300
  提示：     输入「确认」执行转账，输入其他内容取消

> 确认                        ← 确认

✅ 转账成功！
  转账金额：$200
  扣款前余额：$500
  扣款后余额：$300

── 最终 State ──
  状态：     ✅ 已确认
  最终余额：$300
```

---

## 七、核心洞察

### 🔑 这个文件是前半程的集大成者

这里用到的每一个能力，都在前面的文件里单独验证过：

| 概念 | 首次出现 | 在本文件中的应用 |
|------|---------|----------------|
| 线性边 `addEdge` | basic-graph | START→askAmount, showTransfer→waitConfirm |
| 条件边 `addConditionalEdges` | conditional-routing | valid/invalid + confirmed/cancelled |
| 回边 (自环) | loop-retry | invalid → askAmount |
| Checkpointer + thread_id | checkpointer-memory | compile({ checkpointer }) 支撑 interrupt |
| interrupt + Command | graph-interrupt | 两个 interrupt + 三段式外部调度 |

**没有一个概念是新的**——但组合起来就变成了一个完整的转账业务流。

### 🔑 真实 Agent 的骨架

这个模式可以推广到任何"需要人工审核"的场景：

```
金融：    请求转账 → 人工审核 → 执行转账
电商：    下单 → 确认库存 → 确认支付
审批流：  提交申请 → 逐级审批 → 归档
内容审核： 用户发帖 → AI 检测 → 人工复核
```

每个场景拆开都是同一个结构：**检查 → 暂停等确认 → 执行或取消**。区别只在于节点内部的业务逻辑不同。

### 🔑 外部调度 = UI 层

如果你把这张图看作"后端业务逻辑"，那外部调度代码就是"前端交互层"：

| 代码位置 | 职责 | 类比 |
|---------|------|------|
| 图定义（nodes + edges） | **业务流程** | 后端的 Controller + Service |
| 外部调度（while + invoke） | **交互控制** | 前端的 ViewModel + Router |
| `__interrupt__` | 通知外部"我在等你" | WebSocket 推送消息 |
| `Command({ resume })` | 外部回传决策 | HTTP POST 表单提交 |

这种分离使得同一个图可以对接不同的前端——终端交互、Web UI、API 调用，都通过 `Command` + `__interrupt__` 通信。

---

## 八、踩坑记录：EmptyInputError — 空 Command 引发的崩溃

### 现象

在 `askAmount` 的 `> ` 提示处直接按回车（空输入）：

```
提示： 请输入转账金额（$1 ~ $500）
当前余额：$500
>                          ← 直接回车

file:///.../loop.js:445
if (Object.keys(writes).length === 0) throw new EmptyInputError("...");
```

### 根因

调用链拆开：

```
用户直接回车
  → rl.question("> ") 返回 ""
  → .trim() → ""
  → new Command({ resume: "" })    ← 空字符串
  → LangGraph PregelLoop._first()
  → Object.keys(writes).length === 0  ← writes 为空对象
  → throw EmptyInputError("Received empty Command input")
```

LangGraph 框架层面做了**空 Command 校验**——`writes`（resume 的值包装后）为空对象时视为非法输入，直接抛错。这不是业务代码的校验问题，而是**调用者传了一个无效的 Command 给框架**。

### 为什么会有这个问题

```
rl.question("> ").trim()
```

`readline/promises` 的 `question()` 在用户直接回车时返回空字符串。而原代码没有对空值做任何防护：

```js
// 原代码（有漏洞）
while (current.__interrupt__?.[0]?.value?.hint?.includes("转账金额")) {
  const amountLine = (await rl.question("> ")).trim();  // ← 回车 → ""
  current = await graph.invoke(new Command({ resume: amountLine }), config);
  //                                     ↑ Command({ resume: "" }) → 崩溃
}
```

同样的漏洞也存在于确认阶段——`confirmLine` 同样没有空值校验，而且原代码中 `if (!line)` 的变量名 `line` 应为 `confirmLine`：

```js
// 原代码（变量名 bug）
const confirmLine = (await rl.question("\n> ")).trim();
await rl.close();
// 注意：下面检查的是 line 而不是 confirmLine
if (!line) {  // ← ReferenceError: line is not defined
```

### 修复方案

**修复 ①：金额输入循环 — 空输入用非法占位符替代**

```js
const raw = (await rl.question("> ")).trim();
const amountLine = raw || " ";  // ← 空输入 → " "，让 isNaN 校验捕获
```

原理：`raw || " "` 在空字符串时替换为空格。`askAmount` 节点中的 `Number(" ")` = 0，`0 <= 0` 为 true → 触发 invalid 回边 → 用户重输。**不改动图结构，不改业务校验，只在外部调度层加一道防护**。

**修复 ②：确认阶段 — 空输入直接友好退出**

```js
const confirmLine = (await rl.question("\n> ")).trim();
await rl.close();

if (!confirmLine) {  // ← 修复变量名 + 空值检查
  console.error("\n未输入，退出。");
  process.exit(1);
}
```

### 通用教训

> **Human-in-the-loop 中，外部传给 `Command.resume` 的值必须非空。**

所有 `rl.question()` 或其他用户输入点传给 `Command.resume` 之前，都要做空值保护。因为：

| 层级 | 校验什么 | 能做什么 |
|------|---------|---------|
| LangGraph 框架 | 检查 `writes` 是否为空对象 | 拒绝 → 抛 `EmptyInputError` |
| 业务节点（askAmount） | 检查金额是否合法 | 走 invalid 回边 → 重问 |
| **外部调度（while 循环）** | 检查输入是否为空 | **兜底：不让空值到达 Command** |

三层校验各管各的：框架层管"格式是否正确"，业务层管"业务是否合法"，调度层管"交互是否友好"。**调度层的空值保护是最外层防线，不能依赖业务节点来处理。**

### 附加陷阱：Number(" ") === 0

修复空 Command 时，起初用了空格 `" "` 做空输入占位符：

```js
// 第一版修复（有 bug）
current = await graph.invoke(new Command({ resume: " " }), config);
```

预期：`Number(" ")` → `NaN` → `isNaN` 为 true → invalid 回边。

实际：`Number(" ")` 在 JavaScript 中返回 **`0`**，不是 `NaN`。

```js
Number(" ");    // → 0  ← 不是 NaN！
Number("");     // → 0  ← 空串也是 0！
Number("abc");  // → NaN ← 这才是预期触发 invalid 的值
```

所以用户只输了一次回车，流程就：

```
raw="" → emptyCount=1 → resume " " → Number(" ")=0
→ amount=0 → amount===0 → skip → cancelTransfer → END
```

**一次空输入就跳过了，"3 次降级"完全没生效。**

修复：把占位符改为 `Number()` 绝对无法解析的值：

```js
// 修复后（用任意非数字字符串）
current = await graph.invoke(new Command({ resume: "__EMPTY__" }), config);
// Number("__EMPTY__") → NaN ✅
```

**教训：** 用 `Number()` 做校验时，`" "` 和 `""` 都是合法的"数字 0"。选占位符必须确保 `Number()` 返回 `NaN`。

### 修复版文件

修复版代码见 `examples/langgraph-test/src/graph-interrupt-pro-fix.mjs`，改动点已标注 `★ 修复` 注释。

---

## 【增强】结合 retry 做降级跳过

### 业务需求

空输入一直重问不够友好。昇哥的想法：**连续 3 次空输入后自动跳过**，把 `0` 当作"跳过"信号让流程走下去。理由很实际——

> 有纰漏总比一直不推进好。

### 改动思路

把 `loop-retry` 的"计数器 + 终止条件"模式嫁接到外部调度层。

```
空输入 #1 → emptyCount=1 → resume " "  → askAmount 校验不过 → invalid → 回边
空输入 #2 → emptyCount=2 → resume " "  → 同上
空输入 #3 → emptyCount=3 → resume "0"  → askAmount 放行 → skip → cancelTransfer → END
```

### 改动点一览

需要改 4 个地方，涉及图结构、节点逻辑、外部调度三个层面：

| # | 改动位置 | 改动内容 | 影响 |
|---|---------|---------|------|
| ① | `askAmount` 校验 | `<= 0` → `< 0`，允许 `amount===0` 通过 | 0 不再是非法值 |
| ② | `conditionalEdges` | 二路 `valid/invalid` → **三路 `valid/skip/invalid`** | 新增 skip 分支，0 直接跳 cancelTransfer |
| ③ | `cancelTransfer` | 判断 `amount===0` 展示不同文案 | 主动取消 vs 自动跳过状态区分 |
| ④ | 外部 `while` | 加 `emptyCount` 计数器，3 次后 resume "0" | 降级触发 |

### 逐处详解

**① askAmount 校验放宽**

```js
// 原版：amount <= 0 → 非法（amount=0 也回边）
if (isNaN(amount) || amount <= 0 || amount > state.balance) {
  return { amount: -1 };
}

// 新版：amount < 0 → 非法（0 是合法跳过信号）
if (isNaN(amount) || amount < 0 || amount > state.balance) {
  return { amount: -1 };
}
return { amount };  // amount=0 也能走到这里
```

核心变化：`<= 0` → `< 0`。`amount=0` 不再是"非法"，而是"合法但跳过"。

**② conditionalEdges 从二路变为三路**

```js
// 原版：二路分支
.addConditionalEdges("askAmount", (state) => state.amount > 0 ? "valid" : "invalid", {
  valid:   "showTransfer",
  invalid: "askAmount",
})

// 新版：三路分支
.addConditionalEdges("askAmount", (state) =>
  state.amount > 0 ? "valid" : state.amount === 0 ? "skip" : "invalid",
  {
    valid:   "showTransfer",   // > 0 → 正常转账流程
    skip:    "cancelTransfer", // = 0 → 直接跳取消（不经过 waitConfirm）
    invalid: "askAmount",      // < 0 → 回边重问
  }
)
```

Mermaid 中会出现第三条虚线边：`askAmount -.-> cancelTransfer`，标签为 `skip`。

**③ cancelTransfer 适配跳状态**

```js
const cancelTransfer = (state) => {
  if (state.amount === 0) {
    console.log("\n⏭️  已自动跳过（3 次未输入有效金额）");
    console.log("  余额保持不变：$" + state.balance);
    return { status: "skipped" };     // ← 区分状态值
  }
  // ... 主动取消的逻辑不变 ...
  return { status: "cancelled" };
};
```

**④ 外部循环加计数器（核心改动）**

```js
let emptyCount = 0;

while (current.__interrupt__?.[0]?.value?.hint?.includes("转账金额")) {
  const raw = (await rl.question("> ")).trim();

  if (!raw) {
    emptyCount++;
    if (emptyCount >= 3) {
      // ★ 第 3 次空输入 → 自动降级跳过
      console.log(`\n⚠️  已连续 ${emptyCount} 次空输入，自动跳过转账`);
      current = await graph.invoke(new Command({ resume: "0" }), config);
      break;  // 跳出 while → 后续不进入确认阶段
    }
    console.log(`  ⚠️ 空输入（${emptyCount}/3），请输入有效金额`);
    current = await graph.invoke(new Command({ resume: " " }), config);
  } else {
    emptyCount = 0;  // 正常输入 → 重置计数器
    current = await graph.invoke(new Command({ resume: raw }), config);
  }
  // ...
}
```

**回边 vs 外部计数器的分工：**

| 层级 | 循环机制 | 职责 |
|------|---------|------|
| 图内 | `invalid → askAmount` 回边 | 拓扑上非法值不能跳到 showTransfer |
| 外部 | `emptyCount` 计数器 | 交互上 3 次空输入后放弃 |

### 完整执行追踪

```
invoke({}) → askAmount interrupt
  ↓
用户输入 ""（回车）
  → emptyCount=1 (<3) → resume " " → isNaN(" ") → amount=-1 → invalid → askAmount interrupt
  → 打印 "⚠️ 空输入（1/3）"
  ↓
用户又输入 ""（回车）
  → emptyCount=2 (<3) → resume " " → 同上 → askAmount interrupt
  → 打印 "⚠️ 空输入（2/3）"
  ↓
用户再次输入 ""（回车）
  → emptyCount=3 (≥3) → resume "0" → amount=0 → skip → cancelTransfer
  → 打印 "⏭️ 已自动跳过（3 次未输入有效金额）"
  → status: "skipped" → END
```

### 运行验证

```bash
# 3 次空输入后自动跳过
cd examples/langgraph-test
printf "\n\n\n" | node --no-warnings src/graph-interrupt-pro-fix.mjs

# 正常流程不受影响（金额+确认）
printf "200\n确认\n" | node --no-warnings src/graph-interrupt-pro-fix.mjs

# 正常流程不受影响（金额+取消）
printf "200\n取消\n" | node --no-warnings src/graph-interrupt-pro-fix.mjs
```

**预期输出特征：**
- Mermaid 图中新增 `skip` 虚线边：`askAmount -.-> cancelTransfer`
- 空输入时显示 `⚠️ 空输入（1/3）`、`（2/3）` 计数器
- 第 3 次后显示 `⏭️ 已自动跳过`，最终 status 为 `skipped`
- 余额始终保持 `$500` 不变

### 关键教训

> **loop-retry 的"计数器 + 终止条件"模式不只在图内有用——它完全可以移植到外部调度层。**

在 `loop-retry.mjs` 中，`tries` 计数器在节点内自增，`ok` 作为退出条件。在这个场景中，`emptyCount` 在外部 while 循环中自增，`emptyCount >= 3` 作为退出条件——模式完全一样，只是实现层级不同。

| 维度 | loop-retry 原版 | 本增强版 |
|------|----------------|---------|
| 计数器位置 | 节点内部（`tries`） | **外部 while 循环（`emptyCount`）** |
| 终止条件 | `tries >= 3 → ok=true` | `emptyCount >= 3 → resume "0"` |
| 退出方式 | `done → END` | `skip → cancelTransfer → END` |

### 增强版文件

最终的完整文件见 `examples/langgraph-test/src/graph-interrupt-pro-fix.mjs`，包含两轮迭代：
- **修复**：空输入 → 占位符 → 回边（EmptyInputError 防护）
- **增强**：3 次空输入 → resume "0" → skip 分支（降级跳过）

所有改动点均标注 `★ 修复` 或 `★ 增强` 注释。

---

## 九、学习注释版

```
examples/langgraph-test/src/graph-interrupt-pro-learning.mjs
examples/langgraph-test/src/graph-interrupt-pro-fix.mjs
```

原始文件保持不变，学习版和修复版各有一份。

---

## 十、从"前半程"到"后半程"

前 6 篇覆盖了 LangGraph 的核心原语：

| 原语 | 文件 | 说明 |
|------|------|------|
| State / Node / Edge | basic-graph | 三要素 |
| 条件路由 | conditional-routing | 分支 |
| 回边 | loop-retry | 循环 |
| 状态持久化 | checkpointer-memory | 记忆 |
| 中断恢复 | graph-interrupt (basic) | 暂停 |
| **组合实战** | **graph-interrupt-pro** | **集成** |

接下来进入后半程：**让 LLM 来取代硬编码的规则逻辑**。

- `prebuilt-tool-node.mjs` → 用 ToolNode 让 LLM 决定调什么工具
- `prebuilt-agent.mjs` → 用 createAgent 几行代码创建一个带记忆的 Agent
- `multi-agent-supervisor.mjs` → 多个 Agent 协作，由 Supervisor 分配任务

---

## 附：如果把"取消"换成确认，余额会怎样？

```js
// 误操作：用户输入了 "取消" 但本意是确认
// → userInput = "取消" ≠ "确认" → 走 cancelTransfer
// → balance 还是 500，status = "cancelled"

// 用户重新开始一次转账流程
// → invoke({}, thread_id) → 从存档读取 balance = 500
// → 一切正常，从头再来
```

checkpointer 保证即使转账被取消，balance 仍然保持扣款前的值。下一次 invoke 同一个 thread_id 时，读取的还是正确的余额。
