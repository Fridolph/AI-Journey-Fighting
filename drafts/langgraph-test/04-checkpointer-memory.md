# 04 — checkpointer-memory.mjs：状态持久化与会话隔离

> 学习日期：2026-05-21
> 原始文件：`examples/langgraph-test/src/checkpointer-memory.mjs`

---

## 一、学习目标

- 理解 LangGraph 的 **checkpointer（检查点机制）**——状态如何跨 invoke 持久化
- 掌握 **thread_id 会话隔离**——不同用户的状态互不干扰
- 感受从"一次性管道"到"可持久化状态机"的质变

---

## 二、为什么需要 checkpointer？

回顾前三篇的局限：

```js
// 没有 checkpointer 时，每次 invoke 都是"从零开始"
const result1 = await graph.invoke({ visitCount: 0 });
// result1.visitCount === 1

const result2 = await graph.invoke({ visitCount: 0 });
// result2.visitCount === 1  ← 又回到 1！
```

每次 invoke 传入的 `visitCount: 0` 都是手动给的初始值。你没法让两次 invoke 之间"记住"第一次的结果。

而真实世界的 Agent 需要记忆：
- 聊天机器人记住你上一句说了什么
- 审批流程记住已经通过了哪些环节
- 多轮表单记住前面填过的字段

**Checkpointer 就是 LangGraph 解决"记忆"问题的机制。**

---

## 三、与前几篇的关键差异

| 维度 | 前三篇 | checkpointer-memory |
|------|--------|---------------------|
| 状态生命周期 | 一次 invoke 内 | **跨 invoke 持久化** |
| 会话概念 | 无 | `thread_id` 区分不同会话 |
| 编译方式 | `.compile()` | `.compile({ checkpointer })` |
| 传入参数 | `invoke(state)` | `invoke(state, config)` |
| 返回值类型 | `graph` 实例 | **`app`** 实例（语义区别） |
| 核心能力 | 图内编排 | **图可暂停、可恢复、带记忆** |

如果前 3 篇是写了**函数**——每次调用重新执行全部逻辑。  
那么 checkpointer 就是做了**状态管理**——调用之间能记住上下文。

---

## 四、逐层拆解

### 4.1 五个新面孔

```js
import { MemorySaver } from "@langchain/langgraph";  // ①

const checkpointer = new MemorySaver();              // ②
const app = graph.compile({ checkpointer });          // ③

const config = { configurable: { thread_id: "用户-小张" } };  // ④
await app.invoke({}, config);  // ⑤
```

逐一拆解：

| # | 要素 | 代码 | 前端类比 |
|---|------|------|---------|
| ① | 存储引擎 | `MemorySaver` | `new Map<string, State[]>()` |
| ② | 实例化 | `new MemorySaver()` | 创建存储容器 |
| ③ | 注入编译 | `compile({ checkpointer })` | 给 Redux store 追加 `redux-persist` |
| ④ | 会话身份证 | `thread_id` | session 的 `sessionId` |
| ⑤ | 带上下文调用 | `invoke(state, config)` | `dispatch(action)` 带上 session 上下文 |

**`graph` vs `app` 的语义差异：**

```js
const graph = new StateGraph(...)     // 蓝图：结构定义
  .addNode(...)                       
  .compile({ checkpointer })          // 编译成可部署的服务  

// 我更喜欢把结果叫 app 而不是 graph，因为：
// - graph 是"结构图型"（蓝图，不可执行）
// - app 是"部署好的服务"（可执行、带状态、带持久化）
```

### 4.2 MemorySaver 内部结构

```js
// 伪代码：MemorySaver 内部就是一个 Map
class MemorySaver {
  #store = new Map();  // key=thread_id, value=State[]

  async save(threadId, state) {
    const chain = this.#store.get(threadId) || [];
    chain.push(state);        // 追加存档
    this.#store.set(threadId, chain);
  }

  async load(threadId) {
    const chain = this.#store.get(threadId);
    return chain?.at(-1);      // 返回最新的存档
  }
}
```

每次节点执行结束后，LangGraph 引擎自动调用 `save()` 写入当前 State。下次 invoke 同一个 `thread_id` 时，先调 `load()` 恢复上次存档。

这个过程对开发者是透明的——你只需要在 `compile()` 时传入 checkpointer 实例，其他一切框架自动完成。

### 4.3 thread_id 隔离实验

```js
const user1 = { configurable: { thread_id: "用户-小张" } };
const user2 = { configurable: { thread_id: "用户-小李" } };

// 小张 3 次      → 小张 1→2→3
await app.invoke({}, user1);  // visitCount: 1
await app.invoke({}, user1);  // visitCount: 2
await app.invoke({}, user1);  // visitCount: 3

// 小李 1 次      → 小李 1（不受小张影响）
await app.invoke({}, user2);  // visitCount: 1 ← 从 0 开始！
```

**关键理解：**

| 行为 | 原因 |
|------|------|
| 小张 3 次 visitCount 累加 | 同 thread_id → 共享 checkpointer 中的存档 |
| 小李 visitCount=1 | 不同 thread_id → 没有存档，从 default 值 0 开始 |
| 小张和小李不互相影响 | 不同 thread_id → 不同 key，完全隔离 |

---

## 五、执行过程可视化

```
MemorySaver 内部 Map 的变化过程：

[初始]
Map: {}

[第 1 次 invoke，thread_id="小张"]
  → 读取存档: key="小张" → 未找到
  → 从 default 值开始: visitCount=0
  → recordVisit: 0→1
  → 存档: Map{ "小张" → [{ visitCount: 1 }] }
  → 返回: { visitCount: 1, message: "第 1 次" }

[第 2 次 invoke，thread_id="小张"]
  → 读取存档: key="小张" → { visitCount: 1 }
  → recordVisit: 1→2
  → 存档: Map{ "小张" → [{ visitCount: 1 }, { visitCount: 2 }] }
  → 返回: { visitCount: 2, message: "第 2 次" }

[第 3 次 invoke，thread_id="小张"]
  → 读取存档: key="小张" → { visitCount: 2 }
  → recordVisit: 2→3
  → 存档: Map{ "小张" → [{...}, {...}, { visitCount: 3 }] }
  → 返回: { visitCount: 3, message: "第 3 次" }

[第 4 次 invoke，thread_id="小李"]
  → 读取存档: key="小李" → 未找到
  → 从 default 值开始: visitCount=0
  → recordVisit: 0→1
  → 存档: Map{ "小张" → [...], "小李" → [{ visitCount: 1 }] }
  → 返回: { visitCount: 1, message: "第 1 次" }
```

---

## 六、运行验证

```bash
cd examples/langgraph-test
node src/checkpointer-memory.mjs
```

**预期输出：**

```
{ visitCount: 1, message: '这是你在本会话里第 1 次进入。' }
{ visitCount: 2, message: '这是你在本会话里第 2 次进入' }
{ visitCount: 3, message: '这是你在本会话里第 3 次进入' }
{ visitCount: 1, message: '这是你在本会话里第 1 次进入。' }
```

---

## 七、核心洞察

### 🔑 Checkpointer 把"图"变成了"服务"

没有 checkpointer 时，图是**无状态函数**：
```
每次 invoke(f(x)) → 永远基于初始值 x 计算
```

有了 checkpointer，图变成**有状态服务**：
```
第 1 次 invoke: 基于初始值 → 执行 → 存档 → 返回
第 2 次 invoke: 读取存档 → 基于存档值 → 执行 → 存档 → 返回
    ↑ 这才是 Agent 能长时间运行的原因：它可以记住会话上下文
```

### 🔑 thread_id 是 Agent 会话的身份证

后续所有 LangGraph 应用都会用到它。你可以想象一个聊天机器人：

| thread_id | 含义 | 存储内容 |
|-----------|------|---------|
| `"session-abc"` | 用户 A 的对话 | messages: [...] |
| `"session-xyz"` | 用户 B 的对话 | messages: [...] |
| `"workflow-001"` | 审批流程 #1 | step: "财务审核" |

每个 thread_id 独立维护状态链，从聊天机器人到审批流程都复用同一套机制。

### 🔑 MemorySaver 是开发期用，生产要换

MemorySaver 把快照存内存里：

```js
// 进程内 Map
Map {
  "用户-小张" => [{ visitCount: 1 }, { visitCount: 2 }, ...]
  "用户-小李" => [{ visitCount: 1 }]
}
```

**进程重启 → 数据丢失**。但好消息是：MemorySaver 和后续的 SqliteSaver 实现了相同的接口，替换成本极低。

这是依赖倒置原则的体现：`compile()` 接收的是 checkpointer 接口（而非具体实现），MemorySaver 和 SqliteSaver 都可以注入。

---

## 八、学习注释版

```
examples/langgraph-test/src/checkpointer-memory-learning.mjs
```

原始文件保持不变，学习版添加了：
- 五个新面孔的逐一拆解
- `graph` vs `app` 的语义区别
- MemorySaver 内部 Map 结构的伪代码
- 存档恢复过程的完整追踪

---

## 九、下一步预告

`checkpointer-sqlite.mjs` — 把 MemorySaver 换成 **SqliteSaver**，快照存到磁盘文件：

```
MemorySaver:  进程内存 → 重启丢数据   ← 当前
SqliteSaver:  磁盘文件 → 重启保留      ← 下一节
```

同时引入 `stream()` 方法，让你**一步步观察图的执行过程**，而不是一次性 `invoke` 拿最终结果。这对于调试和深度理解引擎执行细节非常有用。

---

## 附：手写一个最简单的 checkpointer 理解实验

```js
// 这就是 MemorySaver 的本质
const myCheckpointer = new Map();  // MemorySaver.#store

async function invokeWithMemory(state, threadId) {
  // 1. 读取存档
  const saved = myCheckpointer.get(threadId);  // load()
  const startState = saved ?? { visitCount: 0, message: "" };

  // 2. 执行节点
  const nextState = {
    visitCount: startState.visitCount + 1,
    message: `第 ${startState.visitCount + 1} 次`,
  };

  // 3. 存档
  myCheckpointer.set(threadId, nextState);  // save()
  return nextState;
}

console.log(await invokeWithMemory({}, "小张"));  // visitCount: 1
console.log(await invokeWithMemory({}, "小张"));  // visitCount: 2
console.log(await invokeWithMemory({}, "小李"));  // visitCount: 1
```
