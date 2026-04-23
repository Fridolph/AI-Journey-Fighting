import fs from 'fs/promises'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node'
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({
  path: path.resolve(__dirname, '../.env'),
})

const VECTOR_DIM = 1024
const DEFAULT_PREFIX = 'ebook'
const DEFAULT_BOOK_ID = '1'
const DEFAULT_BOOK_CODE = 'tlbb'
const DEFAULT_SPLITTER_CODE = 'rcs'
const DEFAULT_VERSION = 'v1'
const DEFAULT_CHUNK_SIZE = 800
const DEFAULT_TOP_K = 5
const DEFAULT_PORT = 3456

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  dimensions: VECTOR_DIM,
})

const model = new ChatOpenAI({
  temperature: 0.2,
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
})

const client = new MilvusClient({
  address: 'localhost:19530',
})

function toPositiveInt(value, fallback) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function buildCollectionName({
  prefix,
  bookId,
  bookCode,
  splitterCode,
  version,
  chunkSize,
  chunkOverlap,
  vectorDim,
}) {
  return [
    prefix,
    bookId,
    bookCode,
    splitterCode,
    version,
    `c${chunkSize}`,
    `o${chunkOverlap}`,
    `d${vectorDim}`,
  ].join('_')
}

function buildPrompt(question, results) {
  const context = results
    .map((item, index) => {
      return `[片段 ${index + 1}]
章节: 第 ${item.chapter_num} 章
片段索引: ${item.index}
内容: ${item.content}`
    })
    .join('\n\n━━━━━\n\n')

  return `你是一个严格基于证据回答的《天龙八部》小说助手。

请只根据下面提供的小说片段回答问题，不要使用片段之外的原著知识或常识补全。
如果片段证据不足以支持明确结论，请直接说明“仅根据当前召回片段，证据不足”，并解释缺少什么证据。

【召回片段】
${context}

【用户问题】
${question}

【回答要求】
1. 先给出简短结论
2. 关键判断尽量标注来自哪个片段，例如“根据片段 2”
3. 不要把片段中没有出现的信息说成事实
4. 如果只能部分回答，就明确说明只能部分回答

AI 助手的回答：`
}

async function getEmbedding(text) {
  return embeddings.embedQuery(text)
}

function extractTextFromChunk(chunk) {
  if (!chunk) {
    return ''
  }

  if (typeof chunk.content === 'string') {
    return chunk.content
  }

  if (Array.isArray(chunk.content)) {
    return chunk.content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        if (part?.type === 'text' && typeof part.text === 'string') {
          return part.text
        }
        return ''
      })
      .join('')
  }

  return ''
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

async function ensureCollectionLoaded(collectionName) {
  const hasCollection = await client.hasCollection({
    collection_name: collectionName,
  })

  if (!hasCollection.value) {
    throw new Error(`集合不存在：${collectionName}`)
  }

  try {
    await client.loadCollection({
      collection_name: collectionName,
    })
  } catch (error) {
    if (!error.message.includes('already loaded')) {
      throw error
    }
  }
}

async function retrieveRelevantContent(question, collectionName, topK) {
  const queryVector = await getEmbedding(question)

  const searchResult = await client.search({
    collection_name: collectionName,
    vector: queryVector,
    limit: topK,
    metric_type: MetricType.COSINE,
    output_fields: ['id', 'book_id', 'book_name', 'chapter_num', 'index', 'content'],
  })

  return searchResult.results || []
}

async function streamAnswer(res, question, results, onCloseRef) {
  if (results.length === 0) {
    sendSse(res, 'token', {
      text: '仅根据当前召回片段，证据不足：没有召回到可用片段。',
    })
    return
  }

  const prompt = buildPrompt(question, results)
  const stream = await model.stream(prompt)

  for await (const chunk of stream) {
    if (onCloseRef.closed) {
      return
    }

    const text = extractTextFromChunk(chunk)
    if (!text) {
      continue
    }

    sendSse(res, 'token', { text })
  }
}

async function handleSse(req, res, url) {
  const startedAt = Date.now()
  const question = (url.searchParams.get('question') || '').trim()

  if (!question) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'question 不能为空' }))
    return
  }

  const chunkSize = toPositiveInt(url.searchParams.get('chunkSize'), DEFAULT_CHUNK_SIZE)
  const chunkOverlap = toPositiveInt(
    url.searchParams.get('chunkOverlap'),
    Math.floor(chunkSize / 10),
  )
  const topK = toPositiveInt(url.searchParams.get('topK'), DEFAULT_TOP_K)
  const prefix = url.searchParams.get('prefix') || DEFAULT_PREFIX
  const bookId = url.searchParams.get('bookId') || DEFAULT_BOOK_ID
  const bookCode = url.searchParams.get('bookCode') || DEFAULT_BOOK_CODE
  const splitterCode = url.searchParams.get('splitterCode') || DEFAULT_SPLITTER_CODE
  const version = url.searchParams.get('version') || DEFAULT_VERSION

  const collectionName =
    url.searchParams.get('collection') ||
    buildCollectionName({
      prefix,
      bookId,
      bookCode,
      splitterCode,
      version,
      chunkSize,
      chunkOverlap,
      vectorDim: VECTOR_DIM,
    })

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  })

  res.flushHeaders?.()

  const onCloseRef = { closed: false }
  req.on('close', () => {
    onCloseRef.closed = true
  })

  try {
    sendSse(res, 'meta', {
      question,
      collectionName,
      chunkSize,
      chunkOverlap,
      topK,
    })

    sendSse(res, 'phase', {
      step: 'retrieve-start',
      message: '正在检索 Milvus 中最相关的片段…',
    })

    await ensureCollectionLoaded(collectionName)

    const retrieved = await retrieveRelevantContent(question, collectionName, topK)

    if (onCloseRef.closed) {
      return
    }

    sendSse(res, 'retrieved', {
      count: retrieved.length,
      results: retrieved.map((item, index) => ({
        rank: index + 1,
        score: Number(item.score).toFixed(4),
        id: item.id,
        chapterNum: item.chapter_num,
        chunkIndex: item.index,
        content: item.content,
      })),
    })

    sendSse(res, 'phase', {
      step: 'answer-start',
      message: '已完成检索，开始基于证据流式生成回答…',
    })

    await streamAnswer(res, question, retrieved, onCloseRef)

    if (onCloseRef.closed) {
      return
    }

    sendSse(res, 'done', {
      elapsedMs: Date.now() - startedAt,
      message: '本次回答已完成',
    })
  } catch (error) {
    if (!onCloseRef.closed) {
      sendSse(res, 'error', {
        message: error.message || '未知错误',
      })
    }
  } finally {
    if (!onCloseRef.closed) {
      res.end()
    }
  }
}

async function handlePage(res) {
  const htmlPath = path.resolve(__dirname, './milvus-recall-sse-demo.html')
  const html = await fs.readFile(htmlPath, 'utf8')
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

async function main() {
  console.log('连接到 Milvus...')
  await client.connectPromise
  console.log('✓ 已连接')

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`)

      if (req.method === 'GET' && url.pathname === '/') {
        await handlePage(res)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/chat/stream') {
        await handleSse(req, res, url)
        return
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true }))
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'Not Found' }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: error.message || '服务器内部错误' }))
    }
  })

  server.listen(DEFAULT_PORT, () => {
    console.log(`SSE demo 已启动：http://localhost:${DEFAULT_PORT}`)
    console.log(`健康检查：http://localhost:${DEFAULT_PORT}/health`)
  })
}

main().catch((error) => {
  console.error('启动失败:', error.message)
  process.exit(1)
})
