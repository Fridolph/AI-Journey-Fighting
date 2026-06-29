# 03 — loop-retry.mjs：回边与循环

> 学习日期：2026-05-21
> 原始文件：`examples/langgraph-test/src/loop-retry.mjs`

---

## 一、学习目标

- 理解 **回边（Back Edge）**——条件路由的路径指向自身，形成循环
- 完成 "线 → 树 → 环" 三部曲，感受 LangGraph 表达能力的三次跃升
- 为下一节 **checkpointer（状态持久化）** 做铺垫

---

## 二、三篇对比全景图

用一张表把当前的学习路径收拢：

| 篇 | 形状 | 核心 API | 一句话本质 | 前端类比 |
|----|------|---------|-----------|---------|
| 01 basic-graph | `START→A→B→END` | `addEdge` | 线性顺序执行 | 函数链 `a()→b()` |
| 02 conditional-routing | `START→R→A或B→END` | `addConditionalEdges` | 分支选择 | `if/else` 路由分发 |
| 03 loop-retry | `START→A→A→...→END` | 条件边指向自身 | **循环重试** | `while` / `for` 循环 |

图形化对比：

```
basic-graph:             conditional-routing:        loop-retry:

[START]                     [START]                     [START]
   │                            │                           │
   ▼                            ▼                           ▼
 step1                       router                    attempt ◀─ ─ ─ ┐
   │                          ╱    ╲                      │            │
   ▼                        ╱       ╲                     │  retry     │
 step2                    math     chat                   ▼            │
   │                      (虚线)    (虚线)              done │            │
   ▼                       │        │                      ▼            │
 [END]                     ▼        ▼                   [END]    ─ ─ ─ ─┘
                          [END]  [END]
```

三个形状递进：**线 → 树 → 环**。后面所有 LangGraph 能力都是在这三个形状上叠加。

---

## 三、逐层拆解

### 3.1 State 设计 — "给自己记账"

```js
tries:   计数器,     default: 0       // 第几次尝试
ok:      成功标记,    default: false   // 满足条件了没
message: 输出信息,    default: ""      // 给调用者看的结果
```

对比前两篇的 State 设计思路：

| 篇 | State 的用途 | 比喻 |
|----|------------|------|
| 01 basic-graph | 传球——step1 在上面写字，step2 接着写 | 一本公用笔记 |
| 02 conditional-routing | 快递分拣——router 贴标签，处理节点取件 | 贴了路由标签的包裹 |
| 03 loop-retry | **自己记账**——每次执行都更新自己的计数器 | 出勤打卡表 |

三种设计模式对应三种不同的 Graph 拓扑，这是 LangGraph 开发中最重要的思维模型之一：**State 的结构由图的拓扑决定**，反过来也成立。

### 3.2 attempt 节点 — "一个节点包揽全部角色"

```js
const attempt = (state) => {
  const tries = state.tries + 1;       // ① 记账：次数 +1
  const ok = tries >= 3;               // ② 判断：够 3 次了吗？
  return {
    tries,                             // 更新计数器
    ok,                                // 更新成功标记
    message: ok ? "成功" : "失败，继续重试",  // 更新输出
  };
};
```

**关键观察：这个节点同时做了三件事。**

前两篇里，这三件事分散在不同节点：
- `conditional-routing` 中：**router** 负责判断，**mathNode/chatNode** 负责产出
- 这里：**attempt 一个节点包揽全部**

为什么可以合并？因为**State 的三个字段各司其职**，互不干扰：

| 字段 | 职责 | 谁消费它 |
|------|------|---------|
| `tries` | 累加计数器 | 同一节点的下次执行（if 判断） |
| `ok` | 终止条件旗帜 | addConditionalEdges 的路由键 |
| `message` | 最终输出 | invoke 调用方 |

这个模式很像前端的 `useReducer`——你用一个 reducer 管理多个状态字段，每个字段独立变化、互不影响。

### 3.3 回边 — 本节主角

```js
.addConditionalEdges("attempt", (state) => (state.ok ? "done" : "retry"), {
  retry: "attempt",   // ← 回边！路由表指向自身节点
  done: END,
})
```

和 conditional-routing 的 API **完全一样**，区别只在于路由表的值：

| 分支 | 02 conditional-routing | 03 loop-retry |
|------|----------------------|--------------|
| 条件 A | `math → "math"` 走到另一个节点 | `done → END` 走到出口 |
| 条件 B | `chat → "chat"` 走到另一个节点 | **`retry → "attempt"` 回到自身** |

**这就是回边的全部秘密：** 路由表的 value 写了当前节点的名字。

等效的命令式代码：

```js
// while 循环 — 和图完全同构
let state = { tries: 0, ok: false, message: "" };
while (!state.ok) {              // ← 不满足条件继续循环
  state.tries++;
  state.ok = state.tries >= 3;   // ← 达到 3 次后退出
  state.message = state.ok ? "成功" : "失败";
}

// do-while 循环 — 和图更接近（至少执行一次）
let state = { tries: 0, ok: false, message: "" };
do {
  state.tries++;
  state.ok = state.tries >= 3;
  state.message = state.ok ? "成功" : "失败";
} while (!state.ok);             // ← 不满足条件回到 do
```

LangGraph 版的优势：**你不需要写循环控制变量和 break 条件，只需要声明"ok 就去 END，不 ok 就回 attempt"**，引擎自动处理迭代。

---

## 四、执行过程追踪

```
invoke({ tries: 0, ok: false, message: "" })

第 1 轮：attempt
  → state.tries = 0 + 1 = 1
  → ok = 1 >= 3? → false
  → message = "第 1 次失败，继续重试"
  → addConditionalEdges: ok=false → "retry" → attempt（回边）
  ↑━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┘

第 2 轮：attempt
  → state.tries = 1 + 1 = 2
  → ok = 2 >= 3? → false
  → message = "第 2 次失败，继续重试"
  → addConditionalEdges: ok=false → "retry" → attempt（回边）
  ↑━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┘

第 3 轮：attempt
  → state.tries = 2 + 1 = 3
  → ok = 3 >= 3? → true ← 这次满足了！
  → message = "第 3 次成功"
  → addConditionalEdges: ok=true → "done" → END

最终结果：{ tries: 3, ok: true, message: "第 3 次成功" }
```

---

## 五、Mermaid 图解读

```
graph TD;
  __start__([__start__]):::first
  attempt(attempt)
  __end__([__end__]):::last
  __start__ --> attempt;
  attempt -. &nbsp;done&nbsp; .-> __end__;    // 虚线 + done 标签
  attempt -. &nbsp;retry&nbsp; .-> attempt;  // 虚线自环 + retry 标签
```

这张图很简洁但信息量很足：

| 边 | 样式 | 标签 | 含义 |
|---|------|------|------|
| `START → attempt` | 实线 | 无 | 入口，一定执行 |
| `attempt → END` | 虚线 | "done" | 条件出口，满足 ok 时走 |
| `attempt → attempt` | 虚线自环 | "retry" | **条件回边**，ok=false 时走 |

**回边在 Mermaid 中表现为一条曲线从节点出发绕回自身**，和常规的"节点 A → 节点 B"的直线完全不同——视觉上就能看出"这是个循环"。

---

## 六、运行验证

```bash
cd examples/langgraph-test
node src/loop-retry.mjs
```

**预期输出：**

```
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([__start__]):::first
	attempt(attempt)
	__end__([__end__]):::last
	__start__ --> attempt;
	attempt -. &nbsp;done&nbsp; .-> __end__;
	attempt -. &nbsp;retry&nbsp; .-> attempt;

result: { tries: 3, ok: true, message: '第 3 次成功' }
```

---

## 七、核心洞察

### 🔑 回边 = 循环的声明式表达

不用写 `while` 或 `for`，条件路由的 value 指回自身，引擎自动迭代。这是声明式编程的核心优势：**你描述"什么条件下去哪"，而不是"怎么反复做"**。

### 🔑 "合并在一个节点"也是一个设计模式

前两篇把职责拆到不同节点（router 指路、mathNode 干活）。这里把"记账、判断、输出"放在一个节点里——通过 State 的三个字段各自独立工作来保持清晰。

两种模式没有优劣之分，取决于场景：
- **职责分离**（router 模式）：适合决策逻辑和被决策的逻辑差异大
- **合一模式**（attempt 模式）：适合同一个逻辑块内部的状态自管理

### 🔑 三篇的递进，就是编程控制流的三大基础结构

| 篇 | 控制流结构 | 公式 |
|----|-----------|------|
| basic-graph | 顺序结构 | `A; B;` |
| conditional-routing | 分支结构 | `if (x) A else B` |
| loop-retry | 循环结构 | `while (x) { A }` |

**任何程序都可以用这三种结构表达。** LangGraph 用三个文件就覆盖了图编排的全部控制流原语——这是它作为通用编排引擎的底气。

---

## 八、学习注释版

```
examples/langgraph-test/src/loop-retry-learning.mjs
```

原始文件保持不变，学习版添加了：
- 三部曲递进关系标注
- State "自我记账"的设计模式说明
- 回边的可视化解释
- `MemorySaver` 孤零零 import 的注解（伏笔）

---

## 九、下一步预告

`checkpointer-memory.mjs` — 引入 `MemorySaver`，让图在执行中**保存每一步的快照**。这是 LangGraph 区别于普通 pipeline 的关键差异化能力：

- 当前 loop-retry 的每次 invoke 都是"从头跑到尾"
- 有了 checkpointer，你可以**暂停 → 保存状态 → 恢复 → 继续执行**
- 多轮对话、审批流程、长时间运行的任务都依赖这个能力

前面三篇里的 `MemorySaver` import 都在这里"还债"。

---

## 附：如果 `ok` 条件永远不满足会怎样？

```
尝试：tries >= 3 → ok=true → done → END   ← 正常结束

如果 reducer 写成了：
  reducer: (_prev, next) => _prev           // 只保留旧值
那 tries 永远等于 0，ok 永远为 false → 无限循环
```

LangGraph 有内置的递归深度限制（默认约 25 步），超过后抛出 `GraphRecursionError`，不会真的死循环。在生产环境中你可以配置 `recursionLimit`：

```js
const result = await graph.invoke(
  { tries: 0 },
  { recursionLimit: 10 }  // 最多 10 步
);
```
