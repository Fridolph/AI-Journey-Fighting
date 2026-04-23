import 'dotenv/config'
import path from 'path'
import {
  MilvusClient,
  DataType,
  MetricType,
  IndexType,
} from '@zilliz/milvus2-sdk-node'
import { OpenAIEmbeddings } from '@langchain/openai'
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

const VECTOR_DIM = 1024
const DEFAULT_EPUB_FILE = './天龙八部.epub'
const DEFAULT_BOOK_ID = '1'
const DEFAULT_BOOK_CODE = 'tlbb'
const DEFAULT_PREFIX = 'ebook'
const DEFAULT_SPLITTER_CODE = 'rcs'
const DEFAULT_VERSION = 'v1'

function parseArgs(argv) {
  const options = {
    chunkSize: 800,
    chunkOverlap: undefined,
    collection: '',
    epub: DEFAULT_EPUB_FILE,
    bookId: DEFAULT_BOOK_ID,
    bookCode: DEFAULT_BOOK_CODE,
    prefix: DEFAULT_PREFIX,
    splitterCode: DEFAULT_SPLITTER_CODE,
    version: DEFAULT_VERSION,
    dropIfExists: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

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

    if (arg === '--collection') {
      options.collection = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--epub') {
      options.epub = argv[index + 1]
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

    if (arg === '--prefix') {
      options.prefix = argv[index + 1]
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

    if (arg === '--dropIfExists') {
      options.dropIfExists = true
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

  if (options.chunkOverlap >= options.chunkSize) {
    throw new Error('chunkOverlap 必须小于 chunkSize')
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

function getBookName(epubFile) {
  return path.parse(epubFile).name
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
const bookName = getBookName(options.epub)

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  dimensions: VECTOR_DIM,
})

const client = new MilvusClient({
  address: 'localhost:19530',
})

async function getEmbedding(text) {
  return embeddings.embedQuery(text)
}

async function recreateCollectionIfNeeded() {
  const hasCollection = await client.hasCollection({
    collection_name: collectionName,
  })

  if (hasCollection.value && !options.dropIfExists) {
    throw new Error(
      `集合 ${collectionName} 已存在。若要重建，请追加 --dropIfExists，或手动换一个 --collection 名称。`,
    )
  }

  if (hasCollection.value && options.dropIfExists) {
    console.log(`检测到已有集合 ${collectionName}，准备删除重建...`)
    await client.dropCollection({
      collection_name: collectionName,
    })
    console.log('✓ 已删除旧集合')
  }
}

async function createCollection() {
  console.log(`创建集合: ${collectionName}`)

  await client.createCollection({
    collection_name: collectionName,
    fields: [
      {
        name: 'id',
        data_type: DataType.VarChar,
        max_length: 150,
        is_primary_key: true,
      },
      { name: 'book_id', data_type: DataType.VarChar, max_length: 100 },
      { name: 'book_name', data_type: DataType.VarChar, max_length: 200 },
      { name: 'chapter_num', data_type: DataType.Int32 },
      { name: 'index', data_type: DataType.Int32 },
      { name: 'content', data_type: DataType.VarChar, max_length: 20000 },
      { name: 'vector', data_type: DataType.FloatVector, dim: VECTOR_DIM },
    ],
  })
  console.log('✓ 集合创建成功')

  console.log('创建向量索引...')
  await client.createIndex({
    collection_name: collectionName,
    field_name: 'vector',
    index_type: IndexType.IVF_FLAT,
    metric_type: MetricType.COSINE,
    params: { nlist: 1024 },
  })
  console.log('✓ 索引创建成功')

  await client.loadCollection({
    collection_name: collectionName,
  })
  console.log('✓ 集合已加载')
}

async function insertChunksBatch(chunks, chapterNum) {
  if (chunks.length === 0) {
    return 0
  }

  const data = await Promise.all(
    chunks.map(async (chunk, chunkIndex) => {
      const vector = await getEmbedding(chunk)
      return {
        id: `${options.bookId}_${chapterNum}_${options.chunkSize}_${chunkIndex}`,
        book_id: options.bookId,
        book_name: bookName,
        chapter_num: chapterNum,
        index: chunkIndex,
        content: chunk,
        vector,
      }
    }),
  )

  const result = await client.insert({
    collection_name: collectionName,
    data,
  })

  return Number(result.insert_cnt) || 0
}

async function loadAndInsert() {
  console.log(`\n开始加载 EPUB 文件: ${options.epub}`)

  const loader = new EPubLoader(options.epub, {
    splitChapters: true,
  })

  const documents = await loader.load()
  console.log(`✓ 加载完成，共 ${documents.length} 个章节\n`)

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options.chunkSize,
    chunkOverlap: options.chunkOverlap,
  })

  let totalInserted = 0

  for (let chapterIndex = 0; chapterIndex < documents.length; chapterIndex += 1) {
    const chapter = documents[chapterIndex]
    const chunks = await splitter.splitText(chapter.pageContent)

    console.log(`处理第 ${chapterIndex + 1}/${documents.length} 章...`)
    console.log(`  拆分为 ${chunks.length} 个片段`)

    if (chunks.length === 0) {
      console.log('  跳过空章节\n')
      continue
    }

    console.log('  生成向量并插入中...')
    const insertedCount = await insertChunksBatch(chunks, chapterIndex + 1)
    totalInserted += insertedCount
    console.log(`  ✓ 已插入 ${insertedCount} 条记录（累计: ${totalInserted}）\n`)
  }

  return totalInserted
}

async function main() {
  try {
    console.log('='.repeat(80))
    console.log('Milvus Recall Chunk 实验脚本')
    console.log('='.repeat(80))
    console.log(`prefix: ${options.prefix}`)
    console.log(`bookId: ${options.bookId}`)
    console.log(`bookCode: ${options.bookCode}`)
    console.log(`bookName: ${bookName}`)
    console.log(`chunkSize: ${options.chunkSize}`)
    console.log(`chunkOverlap: ${options.chunkOverlap}`)
    console.log(`splitterCode: ${options.splitterCode}`)
    console.log(`collection: ${collectionName}`)
    console.log(`sourceFile: ${options.epub}`)
    console.log(`vectorDim: ${VECTOR_DIM}`)
    console.log(`dropIfExists: ${options.dropIfExists}`)

    console.log('\n连接 Milvus...')
    await client.connectPromise
    console.log('✓ 已连接')

    await recreateCollectionIfNeeded()
    await createCollection()

    const totalInserted = await loadAndInsert()

    console.log('='.repeat(80))
    console.log('实验数据写入完成')
    console.log('='.repeat(80))
    console.log(`collection: ${collectionName}`)
    console.log(`总写入条数: ${totalInserted}`)
    console.log(`建议记录: chunkSize=${options.chunkSize}, chunkOverlap=${options.chunkOverlap}`)
  } catch (error) {
    console.error('\n错误:', error.message)
    process.exit(1)
  }
}

main()
