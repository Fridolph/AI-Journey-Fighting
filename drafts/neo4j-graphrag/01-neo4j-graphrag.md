# Neo4j 知识图谱 + GraphRAG

> 学习日期：2026-07-01
> 示例代码：`examples/neo4j-graphrag/`

---

## 一、学习目标

- 理解为什么 Milvus 和 ES **做不了多跳推理**
- 掌握 Neo4j Cypher 语句的节点、关系 CRUD
- 用 LangGraph 实现 GraphRAG：问题 → 生成 Cypher → 执行 → LLM 回答

---

## 二、先理解"图"是什么

你已经用过 ES 和 Milvus，它们存的都是一条一条独立的文档：

```
ES / Milvus 的世界：
  文档1：{ id: "life_04", title: "路由器偶尔断流排查笔记", body: "..." }
  文档2：{ id: "life_05", title: "净水器滤芯更换记录", body: "..." }
  文档3：{ id: "life_06", title: "梧州龟苓膏粉冲泡比例", body: "..." }

  文档之间：没有任何连接，互相不知道对方的存在
```

但现实世界里，事物之间是有关系的：

```
"路由器断流笔记" → 涉及 → "路由器" → 需要 → "光猫" → 由 → "运营商提供"
               → 属于话题 → "数码折腾"
               
"净水器滤芯记录" → 涉及 → "净水器"
                → 属于话题 → "家务维保"

"数码折腾" 和 "家务维保" → 同属于 → "家庭生活"
```

**图数据库就是专门用来存这种"关系"的数据库。** 它不关注单个数据本身，而是关注数据之间的连接。

---

## 三、Neo4j 是什么，为什么会出现

### MySQL 处理多层关系的痛点

查"和路由器相关的所有设备，以及这些设备各自的维保记录"：

```sql
SELECT devices.name, maintenance.record
FROM notes
JOIN topics ON notes.topic_id = topics.id
JOIN devices ON topics.device_id = devices.id
JOIN maintenance ON devices.id = maintenance.device_id
WHERE notes.id = 'life_04'
```

多层关系 = 多层 JOIN，4 层以上基本就跪了。

### Neo4j 的解法：把关系当成一等公民

Neo4j 的核心概念只有两个：

```
节点（Node）：事物本身
  (路由器) (光猫) (网线) (运营商) (断流笔记)

关系（Relationship）：事物之间的连接，有方向，有类型
  (断流笔记) -[记录了]→ (路由器)
  (路由器)   -[需要]→   (光猫)
  (光猫)     -[由]→     (运营商)
```

用图表示：

```
  断流笔记
      │
   记录了
      ▼
   路由器 ──需要──→ 光猫 ──由──→ 运营商
      │
   需要
      ▼
   网线
```

查"和路由器相关的所有上下游"只需要：

```cypher
MATCH (n:Note {id: "life_04"})-[*1..3]-(related)
RETURN related
```

`*1..3` = 往外走最多 3 步，不管中间有多少层关系，性能稳定。这是 MySQL 的 JOIN 完全做不到的。

---

## 四、GraphRAG 是什么，和 Agentic RAG 的区别

### 你学过的 Hybrid RAG 的局限

```
用户问："我家所有需要定期维护的设备有哪些？"

Hybrid RAG：
  搜"维护" → 只找到"净水器滤芯记录"
  搜"设备" → 找到一堆不相关的
  它不知道路由器、净水器、绿植都是"家里的设备"
  它不知道这些设备之间有"同属一个家庭"的关系
```

普通 RAG 找的是"某一篇文档"，但找不到"一组相互关联的信息"。

### GraphRAG 的解法

```
用户问："我家所有需要定期维护的设备有哪些？"

GraphRAG：
  在知识图谱里找"家庭" → 找到所有连接的节点
  (家庭) → 包含 → (路由器)(净水器)(绿植)
  (净水器) → 有记录 → (滤芯更换笔记)
  (路由器) → 有记录 → (断流排查笔记)
  → 全部塞给 LLM → 完整回答
```

**GraphRAG 的核心价值：沿着关系链路"跳跃式"找到间接相关的信息。**

### 对比

| 场景 | Hybrid RAG | GraphRAG |
|---|---|---|
| "路由器怎么排查断流" | ✅ 直接命中笔记 | ✅ 也能找到 |
| "我家哪些东西需要维护" | ❌ 不知道"家"这个概念 | ✅ 沿关系链路找到所有设备 |
| "净水器的订单号是多少" | ✅ 直接命中笔记 | ✅ 也能找到 |
| "A 和 B 之间有什么关联" | ❌ 完全不擅长 | ✅ 这正是图的强项 |

### 用你的笔记数据举个例子

把 10 条笔记建成知识图谱：

```
节点（Node）：
  笔记节点：life_01 ~ life_10
  话题节点：下厨、宠物、家务、数码、差旅、情绪...
  情绪节点：馋、放松、烦躁、无奈...
  物品节点：路由器、净水器、绿萝、龟背竹...

关系（Relationship）：
  (life_01) -[属于]→ (下厨)
  (life_04) -[属于]→ (数码)
  (life_04) -[涉及设备]→ (路由器)
  (life_05) -[涉及设备]→ (净水器)
  (路由器)   -[同属]→ (家庭设备)
  (净水器)   -[同属]→ (家庭设备)
```

有了这张图，你可以问：
- "我家有哪些设备需要关注？" → 找 `(家庭设备)` 的所有子节点
- "下厨相关的笔记有几条？" → 找 `[属于下厨]` 的所有笔记节点
- "烦躁情绪下写的笔记都是关于什么的？" → 找 `(烦躁)` 连接的笔记，再看话题

---

## 五、三种检索方式对比

| 检索方式 | 擅长 | 做不了 |
|---------|------|--------|
| Milvus 语义检索 | "奶茶推荐" 命中 "珍珠奶茶攻略" | 无法告诉你珍珠奶茶→珍珠→煮制的关联链 |
| ES 关键词检索 | 搜"珍珠奶茶"命中包含这个词的文档 | 分不清"珍珠奶茶"和"台式奶茶"的品类关系 |
| **Neo4j 图谱检索** | "珍珠奶茶有哪些配料？这种配料用什么工艺？" | 不擅长模糊语义、海量文档全文搜索 |

> Milvus 和 ES 是"精准找货"——一个按语义相似找，一个按关键词找。Neo4j 是"理清货与货的关系"——A 属于 B、A 包含 C、C 使用 D。

**三者不是替代关系，是互补关系。**

---

## 六、Cypher 基础操作

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

## 七、用代码操作 Neo4j

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

## 八、GraphRAG：LangGraph + Neo4j

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

## 九、Docker Compose 安装

```bash
cd examples/neo4j-graphrag
docker compose up -d
```

启动后：
- Neo4j Browser：`http://localhost:7474`（图形界面，用户名 neo4j / 密码 12345678）
- Bolt 协议：`bolt://localhost:7687`（代码连接）

---

## 十一、实战：my-resume 简历图谱设计

### 11.1 从"表格思维"到"图思维"

| 表格思维（MySQL） | 图思维（Neo4j） |
|------------------|---------------|
| 数据存在行列里 | 数据存在节点和关系里 |
| 关联靠 JOIN | 关联靠 MATCH 路径 |
| 问"这张表有什么字段" | 问"这个世界里有哪些实体和连接" |
| 适合结构化统计 | 适合语义查询和推理 |

### 11.2 设计原则：把简历读成一段话

每条关系都对应一句自然语言：

```
付寅生 毕业于 四川大学锦江学院
付寅生 有经历 [在网思科平的那段时光]
[那段经历] 任职于 网思科平
付寅生 参与 EDR项目
EDR项目 使用 Vue3
付寅生 擅长 前端核心能力
Vue3 属于 前端核心能力
付寅生 具备 AI工程化实践的亮点
付寅生 兴趣 羽毛球
```

**每一条关系，都是一句自然语言。这就是检验关系设计好不好的标准。**

### 11.3 最终节点和关系

**9 种节点类型：**

| 节点 | 说明 |
|------|------|
| `MR_Person` | 本人，含 name/title/location/email |
| `MR_Technology` | 具体技术，从 experiences/projects 的 technologies[] 提取 |
| `MR_Skill` | 技能分类标签，含 proficiency |
| `MR_Company` | 就职公司，关联 `MR_Industry` |
| `MR_Industry` | 行业领域 |
| `MR_Experience` | 工作经历，含 role/startDate/endDate/summary |
| `MR_Project` | 项目，含 coreFunctions/highlights |
| `MR_School` | 教育背景 |
| `MR_Interest` | 兴趣爱好 |

**11 条关系：**

| 关系 | 语义 |
|------|------|
| `(Person)-[:掌握]->(Technology)` | 我掌握了这项技术 |
| `(Person)-[:擅长]->(Skill)` | 我擅长这个能力领域 |
| `(Person)-[:有经历]->(Experience)` | 我有这段工作经历 |
| `(Person)-[:参与]->(Project)` | 我参与了这个项目 |
| `(Person)-[:毕业于]->(School)` | 我毕业于这所学校 |
| `(Person)-[:兴趣]->(Interest)` | 我的兴趣爱好 |
| `(Person)-[:具备]->(Highlight)` | 我具备这个亮点 |
| `(Experience)-[:任职于]->(Company)` | 这段经历在哪家公司 |
| `(Experience)-[:使用了]->(Technology)` | 这段经历中使用了什么技术 |
| `(Project)-[:使用]->(Technology)` | 这个项目用了什么技术 |
| `(Technology)-[:属于]->(Skill)` | 这项技术属于哪个能力分类 |

### 11.4 Seed 脚本的核心思路

```
原始数据 (JSON)
    ↓
① 实体提取      从 experiences/projects/skills 提取所有名词
    ↓
② 数据清洗      "Nuxt 4" → "Nuxt"，去版本号，去重
    ↓
③ MERGE 建节点  幂等写入，跑多次不会重复
    ↓
④ MERGE 建关系  先有节点，再连线
    ↓
⑤ 统计验证      数量对不对？关系有没有断？
```

**MERGE 是关键**——语义是"存在就用，不存在就建"，保证脚本可以反复执行。

### 11.5 设计关系时最容易忽略的一步

**先想好"我会问什么问题"，再反推图模型能不能回答。**

```cypher
// 我用过哪些技术？
MATCH (p:MR_Person)-[:掌握]->(t:MR_Technology) RETURN t.name

// Neo4j 在哪个项目里用过？
MATCH (proj:MR_Project)-[:使用]->(t:MR_Technology {name: 'Neo4j'}) RETURN proj.name

// 我的前端能力包含哪些技术？
MATCH (s:MR_Skill {name: '前端核心能力'})<-[:属于]-(t:MR_Technology) RETURN t.name

// 我的完整职业路径？
MATCH (p:MR_Person)-[:有经历]->(e:MR_Experience)-[:任职于]->(c:MR_Company)
RETURN e.role, c.name, e.startDate, e.endDate
```

## 十二、通用图设计框架

拿到任何新数据集，按这五步来：

```
1. 问：这里有哪些"实体"？（名词）
2. 问：实体之间有哪些"关系"？（动词）
3. 问：我将来会问什么"问题"？（查询场景）
4. 反推：查询场景能否被图模型支撑？
5. 迭代：跑脚本 → 验证 → 发现问题 → 改
```

**第 3 步最容易被忽略，但最重要——你的图谱是为了回答问题而存在的。**

## 十三、代码文件

| 文件 | 做什么 |
|------|--------|
| `cypher.md` | Cypher 语句速查（节点、关系、查询） |
| `cypher2.md` | 更新、删除语句 |
| `src/neo4j-test.mjs` | 代码操作 Neo4j（CRUD） |
| `src/graphrag.mjs` | LangGraph + Neo4j GraphRAG 完整流水线 |
