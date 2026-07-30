import "dotenv/config";
import { MilvusClient } from "@zilliz/milvus2-sdk-node";

const COLLECTION = process.env.MILVUS_COLLECTION ?? "rag_docs";
const client = new MilvusClient({
  address: (process.env.MILVUS_URI ?? "localhost:19530").replace(/^https?:\/\//, ""),
});

await client.connectPromise;

// 1. 看有多少条
const stats = await client.getCollectionStatistics({ collection_name: COLLECTION });
console.log(`总记录数: ${stats.data.row_count}`);

// 2. 看 Schema
const desc = await client.describeCollection({ collection_name: COLLECTION });
console.log(`\n字段:`);
desc.schema.fields.forEach((f) => {
  console.log(`  ${f.name}  (${f.data_type})`);
});

// 3. 输出前 5 条数据
const res = await client.query({
  collection_name: COLLECTION,
  filter: "langchain_primaryid >= 0",
  output_fields: ["langchain_text", "source"],
  limit: 5,
});
console.log(`\n前 ${res.data.length} 条数据:`);
res.data.forEach((row, i) => {
  console.log(`\n[${i + 1}] 来源: ${row.source}`);
  console.log(`    内容: ${row.langchain_text.slice(0, 100)}…`);
});

process.exit(0);
