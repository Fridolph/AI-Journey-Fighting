# 科普释义

> 学到一个新概念，先别急着啃源码。花 2 分钟扫一眼这里——知道它是什么、为什么出现、在整个体系里站在哪个位置。后面再深入博客和代码时，心里就有一张坐标图了。

## 检索 & 分词

| 概念 | 一句话 |
|------|--------|
| [倒排索引](./inverted-index.md) | 搜索引擎的「目录页」——从词查文档，而不是从文档找词 |
| [IK 分词器](./ik-analyzer.md) | 把中文句子切成有意义的词，ElasticSearch 中文检索的基石 |
| [BM25](./bm25.md) | 打分公式——给查询和文档的匹配程度算一个「相关性分」 |

## 向量 & 语义

| 概念 | 一句话 |
|------|--------|
| [Embedding](./embedding.md) | 把文字变成一串数字（向量），意思相近的词向量也相近 |
| [HNSW](./hnsw.md) | 让向量检索从「遍历百万条」变成「跳 20 步就找到」的索引算法 |
| [向量数据库](./vector-database.md) | 专门存向量、搜向量的数据库——RAG 的存储基座（Milvus/Qdrant/Chroma 等） |
| [Rerank](./rerank.md) | 精排——粗召回后，用更强的模型把最相关的几条挑出来 |

## 混合检索

| 概念 | 一句话 |
|------|--------|
| [混合检索](./hybrid-search.md) | 关键词检索 + 语义检索双管齐下，既不怕冷词也不丢语义 |

## 图 & Agentic 检索

| 概念 | 一句话 |
|------|--------|
| [GraphRAG](./graphrag.md) | 在图谱上做 RAG——从查文档变成查关系，回答需要多跳推理的问题 |
| [Agentic RAG](./agentic-rag.md) | 让 LLM 自己决定什么时候检索、查什么、查几次——RAG 的自主决策版 |

## Agent 核心模式

| 概念 | 一句话 |
|------|--------|
| [ReAct](./react.md) | Think → Act → Observe 循环——所有 AI Agent 的底层思维模型 |
| [MCP](./mcp.md) | 给 AI 工具世界造一个 USB 接口——标准化工具接入协议 |

## 通信 & 流式

| 概念 | 一句话 |
|------|--------|
| [SSE](./sse.md) | 服务端单向推送——ChatGPT 打字机效果的底层技术（与 WebSocket 对比：SSE 单向，WS 双向） |
| [Base64](./base64.md) | 二进制数据的「文字版」——让图片/音频能在 JSON 里传输 |

## 部署 & 工程化

| 概念 | 一句话 |
|------|--------|
| [Docker](./docker.md) | 把应用和环境打包成「集装箱」——在哪跑都一样 → [进阶文档](../fullstack/devops/docker) |
| [Docker Compose](./docker-compose.md) | 一个 YAML 描述所有服务——一条命令全部启动 |
| [多阶段构建](./multi-stage-build.md) | 编译用重型工具，运行只留最小文件——给镜像瘦身 |
| [ORM](./orm.md) | 用写代码的方式操作数据库——`user.save()` 代替 `INSERT INTO` |
| [Monorepo](./monorepo.md) | 把前后端多个项目放在一个 Git 仓库里管 |

---

## 阅读建议

这些概念的编排不是按字母序，而是按 **RAG 数据流 + 工程化链路**：

```text
原始文档 → IK分词/倒排索引 → BM25打分 ──→ 混合检索 ──→ Rerank精排 → 最终上下文
                          Embedding向量 ↗       │
                      HNSW索引 ↑ Milvus存储 ↑    ├─→ Neo4j图谱 → Cypher查询 → GraphRAG
                                                 └─→ LLM自主决策 → Agentic RAG
                                                       ReAct循环 ↑  MCP工具 ↑

通信层：SSE（服务端推送）→ WebSocket（双向实时）→ Base64（二进制编码）
工程化：Docker → Docker Compose → 多阶段构建 → Monorepo → ORM
```

建议从左往右读：先搞懂「怎么找」，再搞懂「怎么找得更准」，然后搞懂「怎么让 AI 自己决定怎么找」，最后补齐工程化能力。
