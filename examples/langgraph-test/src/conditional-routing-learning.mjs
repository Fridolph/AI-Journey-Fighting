/**
 * conditional-routing-learning.mjs
 *
 * 学习版 — 对 examples/langgraph-test/src/conditional-routing.mjs 的逐行注释
 * 原始文件保持不变，本文件仅用于学习理解
 *
 * ============================================
 * 核心思路：从"一条线"升级到"分叉路"
 * basic-graph 的节点始终 step1 → step2
 * 这里多了一个"裁判"节点，根据输入决定走哪条分支
 * ============================================
 */

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

// ─── ① State 拆成三个字段 ────────────────────────────────────
// 每个字段各司其职，不再只是一个 text 走到底
const StateAnnotation = Annotation.Root({
  // query：用户的原始输入
  // 前端类比：表单的 input value，或者 HTTP 请求的 body
  query: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  // route：路由标记，由 router 节点写入，addConditionalEdges 读取
  // 前端类比：React Router 的 path/to，或者 switch-case 的 case 值
  route: Annotation({
    reducer: (_prev, next) => next,
    default: () => "chat", // 默认走 chat 分支，少打字时不会报错
  }),
  // answer：最终输出
  // 前端类比：接口 response body，或者组件渲染的最终数据
  answer: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

// ─── ② router 节点 — "只指路，不干活" ────────────────────────
// 关键理解：这个节点不做业务逻辑，它只负责判断"下一步去哪"
// 前端类比：Vue Router 的导航守卫，只决定 redirect 到哪
const router = (state) => {
  // 检查 query 里有没有数学运算符（+ - * /）
  const isMath = /[+\-*/]/.test(state.query);
  // 返回 route 字段，标记走哪条路
  return { route: isMath ? "math" : "chat" };
};

// ─── ③ 两个处理节点 — 各自独立 ──────────────────────────────
// 它们互相不知道对方存在，各自处理自己的分支
// 都只读 state.query、只写 state.answer

// math 分支：尝试执行数学表达式
const mathNode = (state) => {
  try {
    // eval 有安全风险，这里仅用于 demo 演示
    // 生产环境应使用 mathjs 等安全表达式解析库
    return { answer: String(eval(state.query)) };
  } catch {
    return { answer: "表达式无法计算" };
  }
};

// chat 分支：直接 echo 用户的输入
const chatNode = (state) => ({ answer: `你说的是：${state.query}` });

// ─── ④ 搭图 ──────────────────────────────────────────────────
// 与 basic-graph 的关键区别：
//   addEdge          → 固定路径，一定会走
//   addConditionalEdges → 条件路径，根据 state 动态决定
const graph = new StateGraph(StateAnnotation)
  .addNode("router", router) // ← 注册裁判节点
  .addNode("math", mathNode)
  .addNode("chat", chatNode)
  .addEdge(START, "router") // ← 入口先走裁判
  // ★ addConditionalEdges 三个参数：
  //   ① "router" — 从哪个节点出发
  //   ② (state) => state.route — 取路由键的函数（返回 "math" 或 "chat"）
  //   ③ { math: "math", chat: "chat" } — 路由表：键 → 目标节点名
  .addConditionalEdges("router", (state) => state.route, {
    math: "math",
    chat: "chat",
  })
  .addEdge("math", END)
  .addEdge("chat", END)
  .compile();

// ─── ⑤ Mermaid 可视化 ──────────────────────────────────────
// 注意看：条件边在 Mermaid 里渲染为虚线（-.->）
// 固定边是实线（-->），一眼就能区分"确定性路径"和"条件路径"
const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({ withStyles: true });
console.log(mermaid);

// ─── ⑥ 两次 invoke ──────────────────────────────────────────
// 相同的图，不同的输入 → 走不同的路径 → 得到不同的结果
// 这就是"条件路由"的核心价值

// 第一次：输入你好 → router 判断不是数学 → route="chat" → 走 chatNode
// 输出：{ query: "你好", route: "chat", answer: "你说的是：你好" }
console.log("result:", await graph.invoke({ query: "你好" }));

// 第二次：输入 10 * 8 → router 判断包含运算符 → route="math" → 走 mathNode
// 输出：{ query: "10 * 8", route: "math", answer: "80" }
console.log("result:", await graph.invoke({ query: "10 * 8" }));

// ─── 思维模型 ──────────────────────────────────────────────
// 如果把 basic-graph 比作"一条传送带"（物料从 A→B→C 依次加工）
// conditional-routing 就是"一个分拣传送带"：
//   - router = 分拣员，扫描包裹上有没有"数学"标签
//   - 有标签 → 走 math 通道 → 计算
//   - 无标签 → 走 chat 通道 → 回复
//   - 两个通道的工人（mathNode / chatNode）各干各的，互不干扰
//
// 后续的 supervisor agent 就是"路由器 + 子 Agent"的嵌套升级版
