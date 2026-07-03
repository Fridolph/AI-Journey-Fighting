# Neo4j


Neo4j 是一个**图数据库**——不存表格，存节点和关系。它解决的核心问题是：传统数据库做多层关联查询（JOIN）时性能崩塌，而图数据库沿着关系边走，遍历深度不影响查询性能。

## 为什么需要图数据库

Milvus 语义检索找"意思相近"，ES 关键词检索找"包含这个词"。但它们都不知道 **A 和 B 之间有什么关系**。

| 场景 | MySQL/ES/Milvus | Neo4j |
|------|----------------|-------|
| "你有哪些全栈技能" | 搜包含"全栈"的文档 → 可能没有 | 图查：全栈能力 ← 组成 ← 哪些技能 → 精确返回 |
| "React 属于什么分类" | 搜"React 分类" → 靠语义猜 | 图查：(React)-[:属于]->(分类) → 精确 |
| "哪个项目用了 Neo4j" | 搜"Neo4j" → 找包含这个词的项目描述 | 图查：(项目)-[:使用]->(Neo4j) → 精确 |

> Milvus 和 ES 是"精准找货"——按语义相似或关键词找。Neo4j 是"理清货与货的关系"。

## 核心概念

只有两个：

### 节点（Node）

```cypher
CREATE (p:Product {name: "珍珠奶茶", calorie: "中高"})
```

- `( )` = 节点
- `:Product` = 标签（类似 MySQL 表名）
- `{ }` = 属性（类似字段）

### 关系（Relationship）

```cypher
MATCH (p:Product), (i:Ingredient {name: "珍珠"})
CREATE (p)-[:包含]->(i)
```

- `-[:包含]->` = 有方向、有名字的连线
- 方向重要：`(A)-[:属于]->(B)` ≠ `(A)<-[:属于]-(B)`

## 为什么比 MySQL JOIN 快

查"和路由器相关的所有设备及维保记录"：

```sql
-- MySQL：4 层 JOIN，数据量大时性能崩塌
SELECT ... FROM notes
JOIN note_device ON ...    -- 第1层
JOIN devices ON ...         -- 第2层
JOIN device_maintenance ON ... -- 第3层
JOIN maintenance ON ...     -- 第4层
```

```cypher
// Neo4j：不管多少层，性能稳定
MATCH (n:Note {id: "life_04"})-[*1..3]-(related)
RETURN related
```

`*1..3` = 跳 1 到 3 步，自动找到所有关联节点。**遍历深度不影响查询性能。**

## Cypher 基础

### 增

```cypher
CREATE (p:Product {name: "珍珠奶茶"})
CREATE (i:Ingredient {name: "珍珠"})

MATCH (p:Product {name: "珍珠奶茶"}), (i:Ingredient {name: "珍珠"})
CREATE (p)-[:包含]->(i)
```

### 查

```cypher
// 单跳
MATCH (p:Product {name: "珍珠奶茶"})-[:包含]->(i)
RETURN i.name

// 多跳（GraphRAG 灵魂）
MATCH (p:Product {name: "珍珠奶茶"})-[:包含]->(i)-[:使用]->(m)
RETURN p.name, i.name, m.name
// 珍珠奶茶 → 珍珠 → 煮制
```

### 改

```cypher
MATCH (p:Product {name: "珍珠奶茶"})
SET p.price = 15
```

### 删

```cypher
// 删关系
MATCH (p:Product)-[r:包含]->(i:Ingredient {name: "珍珠"})
DELETE r

// 删节点 + 连带关系
MATCH (i:Ingredient {name: "芋圆"})-[r]-()
DELETE r, i
```

## 代码操作

```js
import neo4j from 'neo4j-driver';

const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', '12345678'));
const session = driver.session();

await session.run(`CREATE (p:Product {name: "珍珠奶茶"})`);

const result = await session.run(`
  MATCH (p:Product {name: "珍珠奶茶"})-[:包含]->(i)
  RETURN i.name
`);
result.records.forEach(r => console.log(r.get('i.name')));
```

## GraphRAG：知识图谱 + RAG

LangGraph 三节点流水线：

```
START → generateCypher（LLM 生成查询）
      → executeGraph（Neo4j 执行）
      → generateAnswer（LLM 组织回答）
      → END
```

```js
.addNode('generateCypher', async (state) => {
  const prompt = `你是 Cypher 生成器。关系方向：(Product)-[:包含]->(Ingredient)
    用户问题：${state.query}。只返回 Cypher。`;
  const res = await llm.invoke(prompt);
  return { cypher: res.content };
})
```

## 实战：my-resume 简历图谱

### 设计原则

**每条关系都是一句自然语言：**

```
付寅生 毕业于 四川大学锦江学院
付寅生 有经历 [在网思科平的那段时光]
付寅生 擅长 前端核心能力
Vue3 属于 前端核心能力
EDR项目 使用 Vue3
```

### 节点和关系

9 种节点：Person / Technology / Skill / Company / Industry / Experience / Project / School / Interest

11 条关系：掌握 / 擅长 / 有经历 / 参与 / 毕业于 / 兴趣 / 具备 / 任职于 / 使用了 / 使用 / 属于

### 验证查询

```cypher
// 我用过哪些技术？
MATCH (p:MR_Person)-[:掌握]->(t:MR_Technology) RETURN t.name

// Neo4j 在哪个项目里用过？
MATCH (proj:MR_Project)-[:使用]->(t:MR_Technology {name: 'Neo4j'}) RETURN proj.name

// 我的前端能力包含哪些技术？
MATCH (s:MR_Skill {name: '前端核心能力'})<-[:属于]-(t:MR_Technology) RETURN t.name
```

## 安装

```bash
cd examples/neo4j-graphrag
docker compose up -d
```

- Browser：`http://localhost:7474`（neo4j / 12345678）
- Bolt：`bolt://localhost:7687`（代码连接）

## 与 Milvus / ES 的定位

| | 检索原理 | 擅长 |
|----|---------|------|
| **Milvus** | 向量相似度 | 模糊语义、自然语言 |
| **ES** | 倒排索引 + BM25 | 精确词条、专业术语 |
| **Neo4j** | 图谱关系 + Cypher | 实体关联、多跳推理 |

三者不是替代，是互补。生产级 RAG 的标准方案就是三者同时使用。


---

# 进阶

基础篇掌握了节点、关系、Cypher CRUD。进阶篇关注四个维度：**性能优化、图设计方法论、GraphRAG 召回质量、与 RAG 系统的集成模式。**

## 一、性能优化

### 索引

默认只根据标签和主键查。按属性频繁查询时需建索引：

```cypher
CREATE INDEX tech_name FOR (t:Technology) ON (t.name)
CREATE INDEX skill_name FOR (s:Skill) ON (s.name)
```

无索引时 `MATCH (t:Technology {name: "Vue"})` 全扫，有索引后直接定位。

### 查询优化

- **用 `EXPLAIN` 看执行计划**：和 MySQL `EXPLAIN` 一样，看是 NodeIndexSeek 还是 AllNodesScan
- **避免全图扫描**：`MATCH (n) RETURN n` 在生产环境是灾难——只查少数节点就指定标签
- **控制遍历深度**：`[*1..3]` 优于 `[*]`（无上限），后者可能导致图遍历过深
- **用 `LIMIT` 截断**：`RETURN n LIMIT 100`

```cypher
// ❌ 全图扫
MATCH (n) RETURN n

// ✅ 指定标签 + 索引
MATCH (t:Technology {name: "Vue"}) RETURN t

// ✅ 先锚定再展开
MATCH (p:MR_Person {name: "付寅生"})-[*1..3]-(related)
RETURN related LIMIT 50
```

### 批量写入

逐条插入远慢于 batch：

```js
// ❌ 逐条
for (const row of rows) {
  await session.run(`CREATE (t:Technology {name: $name})`, { name: row.name });
}

// ✅ 批量
const batch = rows.map(r => ({ name: r.name }));
await session.run(`
  UNWIND $batch AS row
  CREATE (t:Technology {name: row.name})
`, { batch });
```

### 数据量过大时的策略

- Partition 分区：按业务域拆分子图（如 `MR_` 前缀隔离简历和奶茶数据）
- 定期清理：`MATCH (n:TempNode) DETACH DELETE n`
- 图不会无限膨胀：节点类型和关系类型是有限的，不像日志数据指数增长

---

## 二、图设计方法论

### 五步法

```
1. 列实体：这里有哪些名词？（Person, Company, Skill...）
2. 列关系：名词之间有哪些动词？（掌握, 任职于, 使用...）
3. 先想问题：我将来会查什么？（"哪些项目用了 Neo4j"）
4. 反推验证：图模型能不能回答第三步的问题？
5. 迭代：跑脚本 → 验证查询 → 漏了就加，方向反了就改
```

核心原则：**如果一条关系不能翻译成一句自然语言，它就不需要存在。**

### 设计陷阱

| 陷阱 | 错误 | 正确 |
|------|------|------|
| 属性当成节点 | `(React)-[:难度]->(高级)` | `(React {level: "高级"})` |
| 方向不统一 | `(React)-[:属于]->(前端)` `(后端)<-[:属于]-(Node)` | 统一从具体 → 抽象 |
| 粒度太细 | 每个技术版本都建节点 | 版本号挂属性 |
| 关系冗余 | `(A)-[:是]->(B)` `(B)-[:被用]->(C)` | 能用一个关系表达的不用两个 |

### 通用设计模板

```
(Owner)       → 谁拥有
  ├─[:掌握]→ (Technology) → 具体技术
  ├─[:擅长]→ (Skill)      → 能力分类，Technology-[:属于]->Skill
  ├─[:有经历]→ (Experience)→ 工作经历
  │   └─[:任职于]→ (Company)
  │   └─[:使用了]→ (Technology)
  ├─[:参与]→ (Project)
  │   └─[:使用]→ (Technology)
  └─[:毕业于]→ (School)
```

大部分个人简历、团队技能管理、项目技术栈追溯都适用这个模板。

---

## 三、GraphRAG 召回质量

### 当前 GraphRAG 的问题

LLM 生成 Cypher，直接执行，拿结果回答。三个环节都可能出错：

| 环节 | 问题 | 表现 |
|------|------|------|
| Cypher 生成 | LLM 不熟悉 Schema | 关系方向写反、标签名拼错 |
| Cypher 执行 | 语法错误或空结果 | 返回 [] 或 Neo4j 异常 |
| 回答生成 | 图结果和语义结果冲突 | 图说"有 5 个"，语义结果说"可能还有" |

### 改进策略

**① Schema 前置注入**

生成 Cypher 前先把节点类型和关系方向显式传给 LLM：

```js
const prompt = `
节点：${nodeTypes.join(', ')}
关系：${relationships.map(r => `(${r.from})-[:${r.name}]->(${r.to})`).join('\n')}
严格按上述 Schema 生成 Cypher。
用户问题：${query}
`;
```

**② 双保险：规则兜底**

LLM 生成的 Cypher 不一定对。加规则校验：

```js
function validateCypher(cypher, schema) {
  // 检查关系方向是否在 Schema 中存在
  // 检查标签名是否在 Schema 中
  // 不通过 → 用规则模板生成（不用 LLM）
}
```

**③ 三元融合**

GraphRAG 的结果不是最终答案——它是**第三路数据源**：

```
用户问题
  ├─ ES 关键词检索 → docs_es
  ├─ Milvus 语义检索 → docs_milvus
  └─ Neo4j 图谱检索 → docs_graph    ← 第三路
         │
         ▼
    三路合并 → Rerank → LLM 回答
```

图谱结果的特点是**精确但覆盖窄**——能告诉你"Vue3 属于前端能力"，但不知道"Vue3 的项目经历里做了什么"。ES 和 Milvus 补充这个缺口。

---

## 四、与 RAG 系统集成

### 路由策略

不是所有问题都值得走 GraphRAG：

| 问题类型 | 走什么 |
|---------|--------|
| "你有哪些 AI 能力" | 图（关系型查询） |
| "你在澳昇做了什么" | ES/Milvus（描述型查询） |
| "用 Vue3 做了什么项目" | 图找项目名 → ES 补详细描述 |

LLM 路由判断 `strategy: {graph, semantic, keyword}` 后分发。

### 图谱设计 vs 召回质量

图不是越大越好。每增加一层关系，问自己三个问题：

```
1. 这条关系会被查询吗？（不会 → 别建）
2. 这条关系能简化其他查询吗？（能 → 值得建）
3. 这条关系的数据从哪里来？（没有数据源 → 先别建）
```

### 维护成本

- 图的数据源是结构化的（简历 JSON、项目 DB、技能标签），不是非结构化文档
- 维护成本 ≈ 维护一个 JSON 配置文件
- 新增技能：加一条 `CREATE` 语句，跑 seed 脚本即可
- 图本身不需要手动维护——MERGE 保证幂等，改数据重跑脚本就行

---

## 五、总结

| 维度 | 要点 |
|------|------|
| **性能** | 建索引 + 指定标签 + 控制深度 + 批量写入 |
| **设计** | 五步法 + "每条关系都是自然语言" + 避免属性当节点 |
| **召回质量** | Schema 前置 + 规则兜底 + 三元融合 |
| **集成** | LLM 路由分发 + 图结果作为第三路数据源 |

---

## 参考资源

- [Neo4j 官方文档](https://neo4j.com/docs/)
- [Cypher 查询手册](https://neo4j.com/docs/cypher-manual/current/)
- [Neo4j GraphRAG 指南](https://neo4j.com/docs/graphrag/)

