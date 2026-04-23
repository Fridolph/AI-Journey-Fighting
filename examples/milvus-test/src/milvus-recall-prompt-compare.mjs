import fs from 'fs'
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

const PROMPT_STRATEGIES = {
  strict: {
    title: '严格贴证据',
    instruction: `你是一个严格基于证据回答的《天龙八部》小说助手。

请只根据提供的小说片段回答问题，不要使用片段之外的原著知识或常识补全。
如果片段证据不足以支持明确结论，请直接说明“仅根据当前召回片段，证据不足”，并解释缺少什么证据。

回答要求：
1. 先给出简短结论
2. 关键判断必须尽量标注来自哪个片段
3. 不要把片段中没有出现的信息说成事实
4. 如果只能部分回答，就明确说明只能部分回答
5. 不要做人物排序、全书总排名、跨人物全局比较，除非片段里已经直接给出`,
  },
  balanced: {
    title: '证据优先 + 有限推断',
    instruction: `你是一个证据优先、但允许有限推断的《天龙八部》小说助手。

请优先依据提供的小说片段回答问题，不要直接使用片段之外的原著知识补全。
如果片段里没有直接定论，但多个片段共同支持一个高概率判断，你可以给出“更可能是……”“从当前片段看，倾向于……”这类有限推断。
必须把“片段直接证明的事实”和“基于片段做出的推断”明确区分开。

回答要求：
1. 先给出简短结论
2. 如果是直接证据，请写“根据片段 X”
3. 如果是有限推断，请明确写“从当前片段推测 / 倾向于 / 更可能”
4. 如果连有限推断都做不到，再明确说明证据不足
5. 不要把推断写成百分之百确定的事实
6. 如果问题是“谁最强 / 谁最漂亮 / 谁最多 / 谁最突出”这类比较题，而片段没有全书总排名，但对少数候选人有明显高评价，可回答“在当前片段涉及的人物里，X 更可能是答案”，并说明这是有限推断
7. 回答结构固定为：
   - 结论
   - 直接证据
   - 有限推断
   - 仍然不足的地方`,
  },
  inferential: {
    title: '较积极推断',
    instruction: `你是一个会综合片段做推断的《天龙八部》小说助手。

请基于提供的小说片段回答问题。优先使用片段证据，但当片段没有直接下结论时，可以结合已有描写做较积极的推断，只要这个推断仍然建立在当前片段之上。
不要调用片段之外的原著知识，不要凭空补造人物或情节。

回答要求：
1. 先给出结论
2. 再写“依据片段”说明
3. 如果结论属于推断，请明确标注“这是基于当前片段的推断，不是原文直接定论”
4. 若当前片段完全不支持判断，再说明证据不足
5. 如果问题是比较题或排序题，可以给出“当前片段下的候选排序 / 最可能答案”，但必须说明比较范围仅限于已召回片段覆盖的人物
6. 优先给出一个最可能答案，其次再补充保留意见`,
  },
}

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
    strategy: 'strict',
    compareStrategies: false,
    saveTo: '',
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
    if (arg === '--strategy') {
      options.strategy = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--compareStrategies') {
      options.compareStrategies = true
      continue
    }
    if (arg === '--all') {
      options.all = true
      continue
    }
    if (arg === '--saveTo') {
      options.saveTo = argv[index + 1]
      index += 1
    }
  }

  if (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0) {
    throw new Error('chunkSize 必须是正整数，例如：--chunkSize 800')
  }

  if (options.chunkOverlap === undefined) {
    options.chunkOverlap = Math.floor(options.chunkSize / 10)
  }

  if (!Number.isInteger(options.chunkOverlap) || options.chunkOverlap < 0) {
    throw new Error('chunkOverlap 必须是非负整数')
  }

  if (!Number.isInteger(options.topK) || options.topK <= 0) {
    throw new Error('topK 必须是正整数')
  }

  if (!PROMPT_STRATEGIES[options.strategy]) {
    throw new Error(`strategy 必须是 ${Object.keys(PROMPT_STRATEGIES).join(' / ')} 之一`)
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

function buildPrompt(strategyKey, question, results) {
  const strategy = PROMPT_STRATEGIES[strategyKey]
  const context = results
    .map((item, index) => {
      return `[片段 ${index + 1}]
章节: 第 ${item.chapter_num} 章
片段索引: ${item.index}
内容: ${item.content}`
    })
    .join('\n\n━━━━━\n\n')

  return `${strategy.instruction}

【召回片段】
${context}

【用户问题】
${question}

AI 助手的回答：`
}

function getQuestionsToRun(options) {
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
  } catch (error) {
    if (!error.message.includes('already loaded')) {
      throw error
    }
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

function printRetrievedContent(results, output = console.log) {
  if (results.length === 0) {
    output('未找到相关内容')
    return
  }

  results.forEach((item, index) => {
    output(`\n[片段 ${index + 1}] 相似度: ${Number(item.score).toFixed(4)}`)
    output(`ID: ${item.id}`)
    output(`书籍: ${item.book_id}${item.book_name ? ` / ${item.book_name}` : ''}`)
    output(`章节: 第 ${item.chapter_num} 章`)
    output(`片段索引: ${item.index}`)
    output(`内容: ${item.content}`)
  })
}

async function answerWithStrategy(strategyKey, question, results) {
  if (results.length === 0) {
    return '仅根据当前召回片段，证据不足：没有召回到可用片段。'
  }

  const prompt = buildPrompt(strategyKey, question, results)
  const response = await model.invoke(prompt)
  return response.content
}

async function run() {
  const lines = []
  const write = (text = '') => {
    console.log(text)
    lines.push(text)
  }

  write('='.repeat(80))
  write('Milvus Prompt 策略对照实验')
  write('='.repeat(80))
  write(`collection: ${collectionName}`)
  write(`chunkSize: ${options.chunkSize}`)
  write(`chunkOverlap: ${options.chunkOverlap}`)
  write(`topK: ${options.topK}`)
  write(`compareStrategies: ${options.compareStrategies}`)
  write(`strategy: ${options.strategy}`)

  write('\n连接 Milvus...')
  await client.connectPromise
  write('✓ 已连接')
  await ensureCollectionLoaded()
  write('✓ 集合已加载')

  const strategiesToRun = options.compareStrategies
    ? ['strict', 'balanced', 'inferential']
    : [options.strategy]

  const questions = getQuestionsToRun(options)

  for (const item of questions) {
    write('\n' + '='.repeat(80))
    write(`${item.label}: ${item.question}`)
    write('='.repeat(80))

    write('\n【检索相关内容】')
    const results = await retrieveRelevantContent(item.question)
    printRetrievedContent(results, write)

    for (const strategyKey of strategiesToRun) {
      write(`\n【Prompt 策略：${strategyKey} / ${PROMPT_STRATEGIES[strategyKey].title}】`)
      const answer = await answerWithStrategy(strategyKey, item.question, results)
      write(String(answer))
    }
  }

  if (options.saveTo) {
    fs.writeFileSync(options.saveTo, `${lines.join('\n')}\n`, 'utf8')
    console.log(`\n✓ 已保存到 ${options.saveTo}`)
  }
}

run().catch((error) => {
  console.error('\n错误:', error.message)
  process.exit(1)
})
