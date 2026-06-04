# RAG 检索增强生成：从原理到 Milvus 实战

## 开篇

前两篇文章讲了 Prompt 管理和记忆系统。但你有没有遇到过这种情况：

```
你问 LLM："我们公司上周发布的 V3.0 版本有什么新功能？"
LLM 答："抱歉，我的训练数据截止到 2023 年..."  ← 不知道
或更糟："V3.0 版本新增了 XX 和 YY 功能..."  ← 编造（幻觉）
```

大模型的知识停留在训练数据的时间点。遇到私有知识、新鲜信息、领域专业内容时，它要么不知道，要么**编一个看起来像那么回事的答案**——这就是"幻觉"。

**RAG（Retrieval-Augmented Generation，检索增强生成）不解决"让模型更聪明"，而是解决"先找到对的知识，再让模型基于知识回答"。**

这篇文章我们走完整条链路：从手写 RAG → Loader/Splitter 自动处理 → Milvus 向量数据库 → ChunkSize 调参。

> 代码来自 `examples/rag-test/` 和 `examples/milvus-test/`。

---

## 一、RAG 的核心三步骤

```
用户问题："乔峰为什么改名萧峰？"
    ↓ ① 检索（Retrieval）
在知识库里找到最相关的文档片段
→ "乔峰得知自己是契丹人，改回本姓萧"
    ↓ ② 增强（Augmented）
把检索结果拼入 Prompt
→ System: "基于以下上下文回答问题..."
→ Context: "乔峰得知自己是契丹人..."
→ Human: "乔峰为什么改名萧峰？"
    ↓ ③ 生成（Generation）
LLM 基于上下文生成回答
→ "乔峰在得知自己其实是契丹人后，恢复了自己的本姓萧..."
```

**第一步：检索——让 Embedding 模型干活**

首先要区分两种模型：
- **Embedding 模型**：把文本变成向量（一串数字），用于语义相似度计算
- **Chat 模型（LLM）**：用于最终生成回答

```js
import { OpenAIEmbeddings } from '@langchain/openai'

const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-v3',
  apiKey: process.env.EMBEDDINGS_API_KEY,
  configuration: { baseURL: process.env.EMBEDDINGS_URL },
})

// "苹果" 和 "水果" 的向量距离近，"苹果" 和 "石头" 的向量距离远
const appleVec = await embeddings.embedQuery('苹果')
const fruitVec = await embeddings.embedQuery('水果')
const stoneVec = await embeddings.embedQuery('石头')
// cosSim(苹果, 水果) >> cosSim(苹果, 石头)
```

这就是语义检索的本质：**语义相近的词，在向量空间里距离更近**。

**完整的 RAG 最小闭环：**

```js
// 1. 准备知识库文档
const documents = [
  new Document({ pageContent: '乔峰是丐帮帮主，武功高强...', metadata: { chapter: '1', role: '乔峰' } }),
  new Document({ pageContent: '乔峰得知自己是契丹人后...', metadata: { chapter: '12', role: '乔峰' } }),
  // ...
]

// 2. 向量化 + 存入向量库
const vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings)

// 3. 检索：找到最相关的 3 个片段
const retriever = vectorStore.asRetriever({ k: 3 })
const relevantDocs = await retriever.invoke('乔峰为什么改名萧峰？')

// 4. 拼入 Prompt，交给 LLM 生成
const context = relevantDocs.map(d => d.pageContent).join('\n')
const answer = await model.invoke([
  new SystemMessage(`基于以下上下文回答问题，如果上下文中没有相关信息，请明确说明。\n上下文：${context}`),
  new HumanMessage('乔峰为什么改名萧峰？'),
])
```

代码位置：`examples/rag-test/src/hello-rag.mjs`

---

## 二、真实文档怎么处理：Loader + Splitter

手写 `Document` 只能做 demo。真实的 RAG 场景面对的是电子书、网页、PDF 等长文档。

### Loader：把各种格式加载进来

```js
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub'

const loader = new EPubLoader('data/天龙八部.epub')
const docs = await loader.load()
// docs 是按章节切分的 Document 数组
```

代码位置：`examples/milvus-test/src/ebook-writer.mjs`

### Splitter：切块——RAG 里最重要的工程决策

长文档不能整篇入库。你需要切成合适大小的"块"（chunk），关键参数有两个：

```js
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,     // 每块最多 500 个字符
  chunkOverlap: 50,   // 相邻块重叠 50 个字符，避免句子被截断
  separators: ['\n\n', '\n', '。', '，', ' '],  // 优先在段落/句子边界切
})

const chunks = await splitter.splitDocuments(docs)
// 一本 2MB 的 epub 可能变成上千个 chunk
```

代码位置：`examples/milvus-test/src/ebook-writer.mjs`

### ChunkSize 怎么选？实 战经验

我在《天龙八部》EPUB 语料上做了对照实验，三组参数对比：

| 参数组 | chunkSize | overlap | 分块数 | 特点 |
|--------|-----------|---------|--------|------|
| Small | 150 | 30 | 16 | 证据定位精准，回答"克制"，但可能碎片化 |
| Base | 500 | 50 | 4 | 均衡，建议起步参数 |
| Large | 1000 | 80 | 更少 | 上下文完整，回答流畅，但可能"发挥过度" |

关键发现：**small 块下 LLM 更"贴证据说话"**。当问题用了强表述（如"根本性逆转"），small 组会回应"原文未明确使用这一强表述"，而不是顺着编。

```bash
# 实际运行的实验对比命令
node ./src/milvus-recall-query.mjs --chunkSize 400 --all
node ./src/milvus-recall-query.mjs --chunkSize 800 --all
node ./src/milvus-recall-query.mjs --chunkSize 1600 --all
```

代码位置：`examples/rag-test/tests/`、`drafts/milvus-test/03-*-A.md`

**建议起步参数**：`chunkSize=500, chunkOverlap=50`。后续根据"回答是否忠于证据"来调整方向。

---

## 三、Milvus：生产级向量数据库

`MemoryVectorStore` 适合 demo，但数据存在内存里，重启就丢。生产环境需要持久化向量数据库。

### 用 Docker 搭建 Milvus

```bash
docker compose -f ./milvus-standalone-docker-compose.yml up -d
```

### 创建 Collection 和索引

```js
import { MilvusClient } from '@zilliz/milvus2-sdk-node'

const client = new MilvusClient({
  address: 'localhost:19530',
});

// 创建 collection（="表"）
await client.createCollection({
  collection_name: 'ebook_tlbb',
  fields: [
    { name: 'id', data_type: 'Int64', is_primary_key: true, autoID: true },
    { name: 'book_id', data_type: 'VarChar', max_length: 128 },
    { name: 'chapter_num', data_type: 'Int64' },
    { name: 'content', data_type: 'VarChar', max_length: 65535 },
    { name: 'vector', data_type: 'FloatVector', dim: 1024 },
  ],
})

// 创建向量索引（IVF_FLAT 是常用选择）
await client.createIndex({
  collection_name: 'ebook_tlbb',
  field_name: 'vector',
  index_type: 'IVF_FLAT',
  metric_type: 'COSINE',
  params: { nlist: 128 },
})

// 加载到内存才能查询
await client.loadCollectionSync({ collection_name: 'ebook_tlbb' })
```

代码位置：`examples/milvus-test/src/ebook-writer.mjs`

### 入库（离线批处理）

```js
for (const chunk of chunks) {
  const vector = await embeddings.embedQuery(chunk.pageContent)
  await client.insert({
    collection_name: 'ebook_tlbb',
    data: [{
      book_id: 'tlbb_v1',
      chapter_num: chunk.metadata.chapter,
      content: chunk.pageContent,
      vector: vector,
    }],
  })
}
```

### 检索（在线查询）

```js
const queryVec = await embeddings.embedQuery('鸠摩智会什么武功？')

const results = await client.search({
  collection_name: 'ebook_tlbb',
  vector: queryVec,
  limit: 3,
  output_fields: ['content', 'chapter_num'],
})

// results 里是最相关的 3 个文档片段
```

代码位置：`examples/milvus-test/src/ebook-query.mjs`

---

## 四、完整 RAG 链路：从电子书到智能问答

把前面讲的串起来，这是一个完整的电子书助手流程：

```
EPUB 电子书
    ↓ EPubLoader 按章节加载
Document 数组
    ↓ RecursiveCharacterTextSplitter 切块
chunk 数组
    ↓ OpenAIEmbeddings 向量化
vector 数组
    ↓ MilvusClient.insert()
Milvus 向量库（持久化）
         ↑
    ┌────┘
    │
用户提问 "乔峰为什么改名萧峰？"
    ↓ Embedding 向量化
query vector
    ↓ MilvusClient.search()
Top-K 相关片段
    ↓ 拼入 Prompt
增强后的 Prompt
    ↓ ChatOpenAI.invoke()
最终回答
```

代码位置：`examples/milvus-test/src/ebook-reader-rag.mjs`

---

## 五、体验优化：SSE 流式返回

在前面的实验中，一个明显的问题是：**等太久，不知道系统在进行到哪一步**。

即使不做性能优化，也可以改善交互体验：

```
普通模式：                              SSE 流式模式：
                                      ⏳ 连接建立...
用户等待 5 秒                          📚 正在检索相关文档...
                                      ✅ 找到 3 条相关记录
一次性返回完整回答                      📝 回答生成中：乔峰在得知自己其实...
                                      ...是契丹人后，恢复了自己的本姓萧...
                                      ✅ 回答完成
```

实现方式：后端用 SSE（Server-Sent Events）单向推送，前端用 `EventSource` 接收：

```js
// 后端（Node.js）
app.get('/rag/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')

  const query = req.query.q

  // 推送检索阶段
  res.write(`data: ${JSON.stringify({ type: 'searching' })}\n\n`)

  const docs = await searchMilvus(query)

  // 推送检索结果
  res.write(`data: ${JSON.stringify({ type: 'search_done', count: docs.length })}\n\n`)

  // 流式推送 LLM 生成内容
  const stream = await model.stream([...])
  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify({ type: 'generating', text: chunk.content })}\n\n`)
  }

  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
  res.end()
})
```

代码位置：`examples/milvus-test/src/ebook-reader-rag-sse.mjs`

---

## 六、小结

RAG 不是让模型变聪明，而是给它配了一个"图书管理员"——先检索到相关的知识，再基于知识生成回答。

完整技术栈：

```
Loader（文档加载）+ Splitter（切块）
    → Embeddings（向量化）
    → Milvus（向量存储 + 语义检索）
    → LLM（基于检索结果生成回答）
    → SSE（流式推送优化体验）
```

关键经验：
1. **chunkSize 不是越大越好**——小块更贴证据，大块更流畅，500 起步
2. **向量维度必须一致**——schema 的 dim 要等于 embedding 模型的输出维度
3. **分开管理**——Milvus 管语义召回，MySQL 管结构化业务数据，双写或异步同步

下一篇文章，我们以一个真实项目——简历 RAG——来展示这条链路的完整应用，从 v1 到 v7 的七次迭代进化。

---

## 相关代码文件

| 文件 | 说明 |
|------|------|
| `examples/rag-test/src/hello-rag.mjs` | RAG 最小闭环（手写 Document） |
| `examples/rag-test/src/hello-rag2.mjs` | Loader + Splitter 实战 |
| `examples/rag-test/tests/` | ChunkSize 对照实验 |
| `examples/milvus-test/src/ebook-writer.mjs` | 电子书写入 Milvus |
| `examples/milvus-test/src/ebook-query.mjs` | Milvus 语义检索 |
| `examples/milvus-test/src/ebook-reader-rag.mjs` | 完整 RAG 问答 |
| `examples/milvus-test/src/ebook-reader-rag-sse.mjs` | SSE 流式 RAG |
| `milvus-standalone-docker-compose.yml` | Milvus Docker 部署 |
