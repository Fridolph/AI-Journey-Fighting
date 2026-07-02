# Cypher

## 一句话

**Neo4j 的查询语言。** SQL 查表，Cypher 查**图**——语法是画出来的，不是写出来的。

## 核心直觉

```cypher
-- SQL 思维：JOIN 表
SELECT * FROM users JOIN orders ON users.id = orders.user_id

-- Cypher 思维：画关系
MATCH (u:User)-[:PLACED]->(o:Order)
RETURN u.name, o.total
```

SQL 的 JOIN 是「按条件把两张表拼在一起」，Cypher 的 MATCH 是「沿关系箭头找到关联节点」。思维模型完全不同。

## 基本语法

```cypher
-- 节点：(变量:标签 {属性})
-- 关系：-[变量:关系名]-> 或 <-[:关系名]-
-- 查询：
MATCH (p:Product {name: "珍珠奶茶"})-[:包含]->(i:Ingredient)-[:使用]->(m:Method)
RETURN p.name, i.name, m.name
-- → 珍珠奶茶 → 珍珠 → 煮制
```

## 和 SQL 的对比

| | SQL | Cypher |
|---|---|---|
| 操作对象 | 表（行列） | 图（节点+关系） |
| 关联方式 | JOIN ON 条件 | MATCH 关系箭头 |
| 多跳查询 | 多层 self-JOIN（灾难） | 直接写箭头链（自然） |
| 学习门槛 | 中等 | 中等（但思维模型不同） |
| 使用场景 | 通用 CRUD | 图关系推理 |

## 小结

Cypher 的价值不在语法本身——而在于 **「用图的方式思考」**。当你面对一个问题，脑子里浮现的是实体和连线而不是表和行时，你就准备好用 Cypher 了。

## 下一步

- [Neo4j](./neo4j.md) — Cypher 运行的图数据库
- [GraphRAG](./graphrag.md) — Cypher 查询 + LLM 的完整方案
