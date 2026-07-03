import 'dotenv/config'
import { Neo4jGraph } from '@langchain/community/graphs/neo4j_graph'
import { ChatOpenAI } from '@langchain/openai'
import { StateGraph, END, START } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'

// ----------------------
// 连接 Neo4j 知识图谱
// ----------------------
const graph = new Neo4jGraph({
  url: 'bolt://localhost:7687',
  username: 'neo4j',
  password: '12345678',
})

// ----------------------
// 大模型
// ----------------------
const llm = new ChatOpenAI({
  model: process.env.MODEL_NAME,
  temperature: 0,
  configuration: { baseURL: process.env.OPENAI_BASE_URL }
})

// ----------------------
// 定义状态
// ----------------------
const state = {
  messages: {
    value: (left, right) =>
      left.concat(Array.isArray(right) ? right : [right]),
    default: () => [],
  },
  cypher: null,
  context: null,
  answer: null,
}

function userQuery(state) {
  const last = state.messages[state.messages.length - 1]
  return last.content
}

// ----------------------
// 动态获取图谱上下文（Schema + 枚举值）
// ----------------------
let graphContext = ''

async function buildGraphContext() {
  await graph.refreshSchema()

  // 并发查询每类节点的所有 name 值
  const [products, types, ingredients, methods, peoples] = await Promise.all([
    graph.query('MATCH (n:Product) RETURN collect(n.name) AS values'),
    graph.query('MATCH (n:Type) RETURN collect(n.name) AS values'),
    graph.query('MATCH (n:Ingredient) RETURN collect(n.name) AS values'),
    graph.query('MATCH (n:Method) RETURN collect(n.name) AS values'),
    graph.query('MATCH (n:People) RETURN collect(n.name) AS values'),
  ])

  return `
图谱结构（Schema）：
${graph.schema}

节点现有数据（必须使用以下真实值，不得自行推断）：
- Product: ${products[0].values.join('、')}
- Type: ${types[0].values.join('、')}
- Ingredient: ${ingredients[0].values.join('、')}
- Method: ${methods[0].values.join('、')}
- People: ${peoples[0].values.join('、')}
  `.trim()
}

// ----------------------
// 步骤1：生成 Cypher
// ----------------------
async function generateCypher(state) {
  const prompt = `
你是一个专业的 Neo4j Cypher 生成器。
只返回纯 Cypher 代码，不要任何解释、不要标点、不要 markdown。

${graphContext}

规则：
1. 关系方向绝对不能反
2. 多跳查询请使用多个 MATCH，不要连错路径
3. 只返回最终可运行的 Cypher 语句
4. 节点属性值必须使用上方「节点现有数据」中的真实值，不得自行推断

用户问题：${userQuery(state)}
  `
  const res = await llm.invoke([new HumanMessage(prompt)])
  return { cypher: res.content }
}

// ----------------------
// 步骤2：执行图查询
// ----------------------
async function executeGraphQuery(state) {
  try {
    const res = await graph.query(state.cypher)
    return { context: JSON.stringify(res) }
  } catch (e) {
    return { context: '未查询到相关知识' }
  }
}

// ----------------------
// 步骤3：生成答案
// ----------------------
async function generateAnswer(state) {
  const prompt = `
你是奶茶专家，根据下方「检索结果」回答用户问题；检索结果为空或不足时简要说明无法从图谱得到答案，不要编造。
回答要求：
- 直接列出事实，不要推断图谱里未出现的配料（如水、冰、添加剂等）。

检索结果：${state.context}
用户问题：${userQuery(state)}
  `
  const res = await llm.invoke([new HumanMessage(prompt)])
  return { answer: res.content }
}

// ----------------------
// 构建 LangGraph 工作流
// ----------------------
const workflow = new StateGraph({ channels: state })
  .addNode('generateCypher', generateCypher)
  .addNode('executeGraph', executeGraphQuery)
  .addNode('generateAnswer', generateAnswer)
  .addEdge(START, 'generateCypher')
  .addEdge('generateCypher', 'executeGraph')
  .addEdge('executeGraph', 'generateAnswer')
  .addEdge('generateAnswer', END)

const app = workflow.compile()

async function printWorkflowMermaid() {
  const drawable = await app.getGraphAsync()
  const mermaid = drawable.drawMermaid({ withStyles: true })
  console.log('--- LangGraph 工作流 (Mermaid) ---')
  console.log(mermaid)
  console.log('-----------------------------------------------------------')
}

// ----------------------
// 运行 GraphRAG
// ----------------------
async function runGraphRAG(question) {
  const res = await app.invoke({
    messages: [new HumanMessage(question)],
  })

  console.log('======================================')
  console.log('用户问题：', question)
  console.log('生成 Cypher：', res.cypher)
  console.log('检索结果：', res.context)
  console.log('最终回答：', res.answer)
  console.log('======================================')
}

// ======================
// 入口
// ======================
;(async () => {
  // 启动时动态读取一次，后续所有问题复用
  graphContext = await buildGraphContext()

  console.log('=== 动态图谱上下文 ===')
  console.log(graphContext)
  console.log('-----------------------------------------------------------')

  await printWorkflowMermaid()

  await Promise.all([
    runGraphRAG('珍珠奶茶适合哪些人群饮用？'),
    runGraphRAG('我们这款珍珠奶茶有哪些配料？'),
    runGraphRAG('台式奶茶的饮品都有哪些配料？'),
  ])
})().catch(console.error)