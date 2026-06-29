/**
 * basic-graph-learning.mjs
 *
 * 学习版 — 对 examples/langgraph-test/src/basic-graph.mjs 的逐行注释
 * 原始文件保持不变，本文件仅用于学习理解
 *
 * ============================================
 * 核心思路：State（数据）→ Node（处理）→ Edge（流向）
 * 前端类比：Redux Store + Reducer 的组合，用"图"代替"switch-case"
 * ============================================
 */

// ─── ① 引入三件套 ─────────────────────────────────────────────
// Annotation：定义 State 结构的工具（类 Schema）
// START / END：框架内置的两个特殊节点——入口和出口
// StateGraph：图容器，把所有东西串起来
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

// ─── ② 定义 State 的数据结构 ───────────────────────────────────
// 前端类比：类似 TypeScript 定义 Redux Store 的类型
// Annotation.Root({...}) 就是声明"这个图共享的全局状态长什么样"
const StateAnnotation = Annotation.Root({
  // 每个字段用 Annotation() 包裹，声明两个行为：
  //   reducer : 当多个节点都想改这个字段时，听谁的
  //   default : 初始值（拿不到值时的兜底）
  text: Annotation({
    // (_prev, next) => next 的含义：
    //   _prev = 上一个节点留下的旧值
    //   next  = 当前节点返回的新值
    //   这个 reducer = "新值直接覆盖旧值"，简单粗暴
    //   后续会看到其他 reducer 模式，比如数组追加 [...prev, next]
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

// ─── ③ 定义 Node（节点） — 纯函数 ────────────────────────────
// 前端类比：Redux Reducer 或 Event Handler
// 规则：接收当前完整 state，返回你要更新的部分（框架自动 merge 到全局 state）

// step1：在 state.text 后面追加 " -> step1"
const step1 = (state) => ({ text: `${state.text} -> step1` });
// step2：在 state.text 后面追加 " -> step2"
const step2 = (state) => ({ text: `${state.text} -> step2` });

// ─── ④ 搭图 ── 把 Node 用 Edge 连接起来 ──────────────────────
// 前端类比：声明式路由配置 / React 组件树的等价物
const graph = new StateGraph(StateAnnotation) // ← 把 State 结构传进去
  .addNode("step1", step1) // ← 注册节点：起个名字，绑定处理函数
  .addNode("step2", step2)
  .addEdge(START, "step1") // ← 从入口开始，第一步走 step1
  .addEdge("step1", "step2") // ← step1 执行完了，接着走 step2
  .addEdge("step2", END) // ← step2 执行完了，到达出口
  .compile(); // ← "冻结"图结构：之后不能再加节点/边

// ─── ⑤ 导出 Mermaid 图（可选） ───────────────────────────────
// LangGraph 内置能力，把图结构输出为 Mermaid 格式
// 可以粘贴到 https://mermaid.live 或 Markdown ```mermaid 里看
const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({ withStyles: true });
console.log(mermaid);

// ─── ⑥ 执行 ──────────────────────────────────────────────────
// invoke() 是"点火"函数：传入初始 state，按图拓扑顺序执行所有节点
// 输入：{ text: "hello" }
// 执行流：START → step1 (text变成 "hello -> step1") → step2 (text变成 "hello -> step1 -> step2") → END
// 输出：最终 state
const result = await graph.invoke({ text: "hello" });
console.log("result:", result);

// ─── 纯函数思维 ──────────────────────────────────────────────
// 每个 node 都是纯函数：
// - 输入确定 → 输出确定（没有副作用）
// - 不直接修改 state，而是返回"增量"（框架自动 merge）
// - 不依赖外部状态（API、文件、数据库等）
//
// 好处：
// - 易于测试（给一个 state，断言 output）
// - 易于调试（每个节点可以打印 state 快照）
// - 易于组合（节点可以插拔、复用、重排）
