/**
 * query-augment-fix.mjs
 *
 * 修复查询扩展：强化 prompt 要求严格多角度，
 * 降级为 2 条扩展（减少浪费），加强 fallback。
 */

import { ChatPromptTemplate } from "@langchain/core/prompts";
import * as z from "zod";

export const QueryAugmentationSchema = z.object({
  queries: z
    .array(z.string())
    .length(3)
    .describe("恰好 3 条不同角度的中文检索问句"),
});

const AUGMENT_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是搜索查询优化器。用户给一句问题，你必须生成恰好 3 条**语义不同**的检索问句。

强制规则：
1. 与原句角度完全不同：可以换术语、换问法、换视角
2. 禁止把原句直接复制为其中一条
3. 专有名词必须原样保留
4. 两条不能内容相同或高度相似

示例（这个例子就是你期望的输出格式）：
原句："家里无线老是断断续续的咋整啊"
  [1] "路由器频繁掉线如何排查"
  [2] "WiFi信号不稳定有哪些常见原因"
  [3] "如何排查并解决家庭中的 WIFI 卡顿、掉线问题"

输出格式：\{\{ "queries": ["问句1", "问句2"] \}\}`,
  ],
  ["human", "{query}"],
]);

function normalizeQueries(original, list) {
  const seen = new Set([original.trim()]);
  const out = [];
  for (const s of list ?? []) {
    const t = (typeof s === "string" ? s.trim() : "");
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  // 不够 3 条时补不同的
  while (out.length < 3) {
    const fallbacks = [
      `${original} 有哪些解决方法`,
      `${original} 常见原因是什么`,
      `如何排查 ${original}`,
    ];
    for (const f of fallbacks) {
      if (!seen.has(f)) { seen.add(f); out.push(f); break; }
    }
  }
  return out.slice(0, 3);
}

export async function augmentQuery(chatModel, query) {
  const structured = chatModel.withStructuredOutput(QueryAugmentationSchema, {
    method: "functionCalling",
    name: "query_augment",
  });
  const chain = AUGMENT_PROMPT.pipe(structured);
  try {
    const raw = await chain.invoke({ query });
    // process.stderr.write("LLM 原始返回: " + JSON.stringify(raw) + "\n");
    return { queries: normalizeQueries(query, raw.queries) };
  } catch (e) {
    // process.stderr.write("LLM 报错: " + e.message + "\n");
    return { queries: normalizeQueries(query, []) };
  }
}

/** 原始问题在前，其后接 LLM 生成的不同角度问句 */
export function retrievalQueryStrings(original, augmentation) {
  return [original, ...(augmentation?.queries ?? [])]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
}
