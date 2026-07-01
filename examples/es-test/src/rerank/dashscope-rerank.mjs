import "dotenv/config";
import { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import https from "node:https";

export class DashScopeRerank extends BaseDocumentCompressor {

  constructor({ apiKey, model = "qwen3-rerank", topN = 3, baseUrl } = {}) {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.topN = topN;
    this.baseUrl = baseUrl ?? process.env.RERANK_URL;
  }

  async compressDocuments(documents, query, _callbacks) {
    const body = JSON.stringify({
      model: this.model,
      input: {
        query,
        documents: documents.map((d) => d.pageContent),
      },
      parameters: {
        return_documents: false,
        top_n: this.topN,
      },
    });

    // Node 25 内置 fetch 对中文字符串有 ByteString 编码 bug
    // 改用 node:https 底层请求，通过 URL 对象避免 header 校验问题
    const url = new URL(this.baseUrl);

    const resp = await new Promise((resolve, reject) => {
      const req = https.request(
        url,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const data = Buffer.concat(chunks).toString("utf8");
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              data,
            });
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    if (!resp.ok) {
      throw new Error(`DashScope rerank ${resp.status}: ${resp.data}`);
    }

    const json = JSON.parse(resp.data);
    const results = json?.output?.results;
    if (!Array.isArray(results)) {
      throw new Error(`unexpected rerank response: ${resp.data}`);
    }

    return results.map((item) => documents[item.index]);
  }
}
