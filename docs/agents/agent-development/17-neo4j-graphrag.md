# Neo4j 知识图谱 + GraphRAG：从文档检索到关系推理

> 示例代码：`examples/neo4j-graphrag/`

## Milvus 和 ES 的边界在哪

三种检索引擎各有所长，**不是替代，是互补**：

| 检索方式 | 擅长 | 做不了 |
|----------|------|--------|
| ES 关键词 | 搜"珍珠奶茶"命中含这个词的文档 | 分不清"珍珠奶茶"和"台式奶茶"的品类关系 |
| Milvus 语义 | "奶茶推荐"命中"珍珠奶茶攻略" | 无法告诉你珍珠→煮制工艺的关联链 |
| **Neo4j 图谱** | 「珍珠奶茶→珍珠→煮制工艺」多跳推理 | 不擅长模糊语义、不擅长海量全文检索 |

## Neo4j 基本概念

```
(张三) -[:认识]-> (李四) -[:就职于]-> (某公司) -[:位于]-> (杭州)
  │                                       │
  └───────────:同学───────────────────────┘
```

- **节点（Node）**：实体，如人、公司、城市——相当于 MySQL 的一行
- **关系（Relationship）**：实体间的连线——Neo4j 的核心价值
- **属性（Property）**：节点和关系上挂的键值对

## Cypher 快速入门

```cypher
-- 创建节点
CREATE (p:Product {name: "珍珠奶茶"})
CREATE (i:Ingredient {name: "珍珠"})
CREATE (m:Method {name: "煮制"})

-- 创建关系
MATCH (p:Product {name: "珍珠奶茶"}), (i:Ingredient {name: "珍珠"})
CREATE (p)-[:包含]->(i)

MATCH (i:Ingredient {name: "珍珠"}), (m:Method {name: "煮制"})
CREATE (i)-[:使用]->(m)

-- 多跳查询（GraphRAG 的核心）
MATCH (p:Product)-[:包含]->(i)-[:使用]->(m)
RETURN p.name, i.name, m.name
-- → 珍珠奶茶 → 珍珠 → 煮制
```

一条 Cypher 串起三层关系——这就是**多跳推理**。用 SQL 写同等查询需要多层 self-join，写起来是灾难。

## GraphRAG：在图谱上做 RAG

### 和传统 RAG 的区别

| | 传统 RAG | GraphRAG |
|---|---|---|
| 数据存储 | 文档切块 → 向量库 | 实体+关系 → 图数据库 |
| 检索方式 | 向量相似度 | Cypher 图查询 |
| 擅长问题 | 「XX 是什么」 | 「A 和 B 什么关系」 |
| 典型问题 | 「LangGraph 是什么」 | 「珍珠奶茶有哪些配料？用什么工艺制作？」 |

### 核心流程

```
用户提问 → LLM 生成 Cypher 查询 → Neo4j 执行 → 拿结果 → LLM 组织回答
```

关键步骤是 **Text-to-Cypher**——LLM 把自然语言翻译成 Neo4j 查询。和 Text-to-SQL 同思路。

### 局限性

- 不适合模糊语义搜索（Embedding 的活）
- 不适合海量文档全文检索（ES 的活）
- 图谱质量决定回答质量

## 三种检索的分工

```
用户问题 ─→ Agent 路由判断
              ├─→ 关键词匹配？ → ES BM25
              ├─→ 语义相似？   → Milvus Embedding
              └─→ 多跳推理？   → Neo4j GraphRAG
```

真正成熟的生产级 RAG，是 Agent 根据问题类型**自主决定走哪条路**——这也就是 Agentic RAG 的核心思路。

## 核心收获

- **Neo4j 存关系比存数据更重要**——当问题需要「谁的谁的什么」这种多跳推理时用图
- **Cypher 比 SQL 更适合关系查询**——(A)-[:X]->(B)-[:Y]->(C) 的语法比 self-join 直观得多
- **Neo4j 不是替代 ES/Milvus**——它是补全「关系查询」这块拼图，三者各管一类问题
