import 'dotenv/config'
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node'
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'

const VECTOR_DIM = 1024
const DEFAULT_PREFIX = 'ebook'
const DEFAULT_BOOK_ID = '1'
const DEFAULT_BOOK_CODE = 'tlbb'
const DEFAULT_SPLITTER_CODE = 'rcs'
const DEFAULT_VERSION = 'v1'
const DEFAULT_CHUNK_SIZE = 800
const DEFAULT_TOP_K = 5

const QUESTIONS = [
  '天龙八部里谁的武功最强？',
  '小说里有没有明确封谁是“天下第一”？',
  '扫地僧在少室山一战中做了什么？',
  '丁春秋的化功大法有什么特点？',
  '虚竹的内力是怎么来的？',
  '段誉的六脉神剑为什么时灵时不灵？',
  '鸠摩智为什么一定要得到六脉神剑？',
  '阿朱是怎么死的？',
  '萧峰、段誉、虚竹三人各自最典型的武功是什么？',
  '小说里哪些人物的轻功特别突出？',
]

function parseArgs(argv) {
  const options = {
    collection: '',
    prefix: DEFAULT_PREFIX,
    bookId: DEFAULT_BOOK_ID,
    bookCode: DEFAULT_BOOK_CODE,
    splitterCode: DEFAULT_SPLITTER_CODE,
    version: DEFAULT_VERSION,
    chunkSize: DEFAULT_CHUNK_SIZE,
    chunkOverlap: undefined,
    topK: DEFAULT_TOP_K,
    question: '',
    questionIndex: 1,
    all: false,
    noAnswer: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--collection') {
      options.collection = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--prefix') {
      options.prefix = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--bookId') {
      options.bookId = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--bookCode') {
      options.bookCode = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--splitterCode') {
      options.splitterCode = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--version') {
      options.version = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--chunkSize') {
      options.chunkSize = Number(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--chunkOverlap') {
      options.chunkOverlap = Number(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--topK') {
      options.topK = Number(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--question') {
      options.question = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--questionIndex') {
      options.questionIndex = Number(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--all') {
      options.all = true
      continue
    }

    if (arg === '--noAnswer') {
      options.noAnswer = true
    }
  }

  if (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0) {
    throw new Error('chunkSize 必须是正整数，例如：--chunkSize 1600')
  }

  if (options.chunkOverlap === undefined) {
    options.chunkOverlap = Math.floor(options.chunkSize / 10)
  }

  if (!Number.isInteger(options.chunkOverlap) || options.chunkOverlap < 0) {
    throw new Error('chunkOverlap 必须是非负整数，例如：--chunkOverlap 160')
  }

  if (!Number.isInteger(options.topK) || options.topK <= 0) {
    throw new Error('topK 必须是正整数，例如：--topK 5')
  }

  if (!Number.isInteger(options.questionIndex) || options.questionIndex < 1 || options.questionIndex > QUESTIONS.length) {
    throw new Error(`questionIndex 必须在 1-${QUESTIONS.length} 之间`)
  }

  return options
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

const options = parseArgs(process.argv.slice(2))
const collectionName =
  options.collection ||
  buildCollectionName({
    prefix: options.prefix,
    bookId: options.bookId,
    bookCode: options.bookCode,
    splitterCode: options.splitterCode,
    version: options.version,
    chunkSize: options.chunkSize,
    chunkOverlap: options.chunkOverlap,
    vectorDim: VECTOR_DIM,
  })

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

async function getEmbedding(text) {
  return embeddings.embedQuery(text)
}

async function ensureCollectionLoaded() {
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
    console.log('✓ 集合已加载')
  } catch (error) {
    if (!error.message.includes('already loaded')) {
      throw error
    }
    console.log('✓ 集合已处于加载状态')
  }
}

async function retrieveRelevantContent(question) {
  const queryVector = await getEmbedding(question)

  const searchResult = await client.search({
    collection_name: collectionName,
    vector: queryVector,
    limit: options.topK,
    metric_type: MetricType.COSINE,
    output_fields: ['id', 'book_id', 'book_name', 'chapter_num', 'index', 'content'],
  })

  return searchResult.results || []
}

function printRetrievedContent(results) {
  if (results.length === 0) {
    console.log('未找到相关内容')
    return
  }

  results.forEach((item, index) => {
    console.log(`\n[片段 ${index + 1}] 相似度: ${Number(item.score).toFixed(4)}`)
    console.log(`ID: ${item.id}`)
    console.log(`书籍: ${item.book_id}${item.book_name ? ` / ${item.book_name}` : ''}`)
    console.log(`章节: 第 ${item.chapter_num} 章`)
    console.log(`片段索引: ${item.index}`)
    console.log(`内容: ${item.content.substring(0, 260)}${item.content.length > 260 ? '...' : ''}`)
  })
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
2. 关键判断必须标注来自哪个片段，例如“根据片段 2”
3. 不要把片段中没有出现的信息说成事实
4. 如果只能部分回答，就明确说明只能部分回答

AI 助手的回答：`
}

async function answerQuestion(question, results) {
  if (results.length === 0) {
    return '仅根据当前召回片段，证据不足：没有召回到可用片段。'
  }

  const prompt = buildPrompt(question, results)
  const response = await model.invoke(prompt)
  return response.content
}

function getQuestionsToRun() {
  if (options.all) {
    return QUESTIONS.map((question, index) => ({
      label: `Q${index + 1}`,
      question,
    }))
  }

  if (options.question) {
    return [
      {
        label: '自定义问题',
        question: options.question,
      },
    ]
  }

  return [
    {
      label: `Q${options.questionIndex}`,
      question: QUESTIONS[options.questionIndex - 1],
    },
  ]
}

async function runOneQuestion({ label, question }) {
  console.log('\n' + '='.repeat(80))
  console.log(`${label}: ${question}`)
  console.log('='.repeat(80))

  console.log('\n【检索相关内容】')
  const results = await retrieveRelevantContent(question)
  printRetrievedContent(results)

  if (options.noAnswer) {
    return
  }

  console.log('\n【AI 回答】')
  const answer = await answerQuestion(question, results)
  console.log(answer)
}

async function main() {
  try {
    console.log('='.repeat(80))
    console.log('Milvus Recall 查询对照脚本')
    console.log('='.repeat(80))
    console.log(`collection: ${collectionName}`)
    console.log(`topK: ${options.topK}`)
    console.log(`chunkSize: ${options.chunkSize}`)
    console.log(`chunkOverlap: ${options.chunkOverlap}`)
    console.log(`bookId: ${options.bookId}`)
    console.log(`bookCode: ${options.bookCode}`)
    console.log(`noAnswer: ${options.noAnswer}`)

    console.log('\n连接 Milvus...')
    await client.connectPromise
    console.log('✓ 已连接')

    await ensureCollectionLoaded()

    const questions = getQuestionsToRun()

    for (const item of questions) {
      await runOneQuestion(item)
    }
  } catch (error) {
    console.error('\n错误:', error.message)
    process.exit(1)
  }
}

main()
