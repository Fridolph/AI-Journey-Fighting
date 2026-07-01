# Neo4j 知识图谱 + GraphRAG

> 学习日期：2026-07-01
> 示例代码：`examples/neo4j-graphrag/`

---

## 一、学习目标

- 理解为什么 Milvus 和 ES **做不了多跳推理**
- 掌握 Neo4j Cypher 语句的节点、关系 CRUD
- 用 LangGraph 实现 GraphRAG：问题 → 生成 Cypher → 执行 → LLM 回答

---

## 二、Milvus 和 ES 的边界在哪儿

| 检索方式 | 擅长 | 做不了 |
|---------|------|--------|
| Milvus 语义检索 | "奶茶推荐" 命中 "珍珠奶茶攻略" | 无法告诉你珍珠奶茶→珍珠→煮制的关联链 |
| ES 关键词检索 | 搜"珍珠奶茶"命中包含这个词的文档 | 分不清"珍珠奶茶"和"台式奶茶"的品类关系 |
| **Neo4j 图谱检索** | "珍珠奶茶有哪些配料？这种配料用什么工艺？" | 不擅长模糊语义、海量文档全文搜索 |

> Milvus 和 ES 是"精准找货"——一个按语义相似找，一个按关键词找。Neo4j 是"理清货与货的关系"——A 属于 B、A 包含 C、C 使用 D。

**三者不是替代关系，是互补关系。**

---

## 三、Cypher 基础操作

### 3.1 创建节点

```cypher
CREATE (p:Product {name: "珍珠奶茶"})
CREATE (i:Ingredient {name: "珍珠"})
CREATE (t:Type {name: "台式奶茶"})
CREATE (m:Method {name: "煮制"})
CREATE (pp:People {name: "年轻人"})
```

`(变量:标签 {属性})` 就是 Neo4j 的"一行记录"。标签相当于 MySQL 的表名，属性相当于字段。

### 3.2 创建关系

```cypher
// (Product)-[:属于]->(Type)
MATCH (p:Product {name: "珍珠奶茶"}), (t:Type {name: "台式奶茶"})
CREATE (p)-[:属于]->(t)

// (Product)-[:包含]->(Ingredient)
MATCH (p:Product {name: "珍珠奶茶"}), (i:Ingredient {name: "珍珠"})
CREATE (p)-[:包含]->(i)

// (Ingredient)-[:使用]->(Method)
MATCH (i:Ingredient {name: "珍珠"}), (m:Method {name: "煮制"})
CREATE (i)-[:使用]->(m)
```

箭头方向就是关系的方向——`(A)-[:关系名]->(B)` = A 到 B 的单向关系。

### 3.3 查询

```cypher
// 多跳查询（GraphRAG 的核心能力）
MATCH (p:Product {name: "珍珠奶茶"})-[:包含]->(i)-[:使用]->(m)
RETURN p.name, i.name, m.name
// 珍珠奶茶 → 珍珠 → 煮制

// 适合人群
MATCH (p:Product {name: "珍珠奶茶"})-[:适合]->(people)
RETURN people.name
```

一条 Cypher 串起三层关系——这就是"多跳推理"。

### 3.4 更新和删除

```cypher
// 更新属性
MATCH (p:Product {name: "珍珠奶茶"})
SET p.calorie = "中高热量", p.taste = "甜香"

// 删除关系
MATCH (p:Product {name: "珍珠奶茶"})-[r:适合]->(s:People {name: "学生"})
DELETE r

// 删除节点 + 连带所有关系
MATCH (i:Ingredient {name: "芋圆"})-[r]-()
DELETE r, i
```

---

## 四、用代码操作 Neo4j

```js
// neo4j-test.mjs
import neo4j from 'neo4j-driver';

const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', '12345678'));
const session = driver.session();

// 创建
await session.run(`CREATE (p:Product {name: "珍珠奶茶"})`);

// 创建关系
await session.run(`
  MATCH (p:Product {name: "珍珠奶茶"}), (i:Ingredient {name: "珍珠"})
  CREATE (p)-[:包含]->(i)
`);

// 查询
const result = await session.run(`
  MATCH (p:Product {name: "珍珠奶茶"})-[r]->(i)
  RETURN p, r, i
`);
result.records.forEach(r => {
  console.log(r.get('p').properties.name, '→', r.get('r').type, '→', r.get('i').properties.name);
});
```

---

## 五、GraphRAG：LangGraph + Neo4j

### 5.1 图结构

```
START → generateCypher → executeGraphQuery → generateAnswer → END
          (LLM生成查询)    (Neo4j执行)        (LLM组织回答)
```

和 advanced-rag 的 `naive-rag`（retrieve → generate）同构——只是检索从"向量/关键词查文档"变成了"LLM 生成 Cypher → Neo4j 执行 → 拿结果"。

### 5.2 generateCypher 节点

```js
async function generateCypher(state) {
  const prompt = `
    你是 Neo4j Cypher 生成器。关系方向必须严格遵守：
    - (Product)-[:包含]->(Ingredient)
    - (Product)-[:适合]->(People)
    - (Ingredient)-[:使用]->(Method)
    只返回纯 Cypher，不要解释。

    用户问题：${userQuery(state)}
  `;
  const res = await llm.invoke([new HumanMessage(prompt)]);
  return { cypher: res.content };
}
```

LLM 看到用户问题 + 图谱 Schema（节点类型和关系方向），自动生成正确的 Cypher 语句。

### 5.3 executeGraphQuery 节点

```js
async function executeGraphQuery(state) {
  const res = await graph.query(state.cypher);
  return { context: JSON.stringify(res) };
}
```

拿 LLM 生成的 Cypher 直接在 Neo4j 上跑，结果作为"检索到的上下文"写入 state。

### 5.4 运行结果

```
用户问题：我们这款珍珠奶茶有哪些配料？

生成 Cypher：
MATCH (p:Product {name: "珍珠奶茶"})-[:包含]->(i:Ingredient)
RETURN i.name

检索结果：[{"i.name": "珍珠"}, {"i.name": "果糖"}, {"i.name": "红茶"}, {"i.name": "牛奶"}]

最终回答：珍珠奶茶包含珍珠、果糖、红茶、牛奶四种配料。
```

---

## 六、三种检索方式对比

| | Milvus | ES | Neo4j |
|----|--------|----|-------|
| 检索原理 | 向量相似度 | 倒排索引 + BM25 关键词 | 图谱关系 + Cypher 推理 |
| 擅长 | 语义模糊匹配 | 精确词条命中 | 实体关联、多跳推理 |
| 典型场景 | "推荐适合春天的奶茶" | "订单号 PO-20250409 的配件" | "珍珠奶茶有哪些配料？珍珠用什么工艺？" |
| 做不了 | 不懂实体间的关系 | 分不清品类层级 | 不擅长模糊语义、海量文档搜索 |

**三者短板刚好互补，组合使用是生产级 RAG 的标准方案。**

---

## 七、Docker Compose 安装

```bash
cd examples/neo4j-graphrag
docker compose up -d
```

启动后：
- Neo4j Browser：`http://localhost:7474`（图形界面，用户名 neo4j / 密码 12345678）
- Bolt 协议：`bolt://localhost:7687`（代码连接）

---

## 八、代码文件

| 文件 | 做什么 |
|------|--------|
| `cypher.md` | Cypher 语句速查（节点、关系、查询） |
| `cypher2.md` | 更新、删除语句 |
| `src/neo4j-test.mjs` | 代码操作 Neo4j（CRUD） |
| `src/graphrag.mjs` | LangGraph + Neo4j GraphRAG 完整流水线 |
