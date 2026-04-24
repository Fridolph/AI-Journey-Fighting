# 第 03 章：GLM 与千问 Embedding 切换踩坑记录

## 背景

在 `memory-test` 的 Retrieval Memory demo 中，我一开始使用的是千问向量模型：

```bash
EMBEDDINGS_MODEL_NAME=text-embedding-v3
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

当时 collection 的向量维度写成 `1024` 是可行的，因为千问的 `text-embedding-v3` 支持通过 `dimensions` 参数自定义输出维度。

后来切换到 GLM：

```bash
MODEL_NAME=glm-5.1
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
EMBEDDINGS_MODEL_NAME=embedding-3
EMBEDDINGS_URL=https://open.bigmodel.cn/api/paas/v4/embeddings
```

这时出现了几个容易误判的问题。

## 坑 1：`dimensions` 不是一定生效

代码里写：

```js
const EMBEDDINGS_DIMENSIONS = process.env.EMBEDDINGS_DIMENSIONS
  ? Number(process.env.EMBEDDINGS_DIMENSIONS)
  : 1024;
```

只能说明“代码希望请求 1024 维”，不代表模型服务最终真的返回 1024 维。

实际要以返回的 `vector.length` 为准。

这点非常关键，因为 Milvus collection 的 `dim` 必须和真实向量长度完全一致。

## 坑 2：GLM 的聊天 baseURL 和 embedding URL 要分开

GLM 的聊天模型走：

```bash
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```

但 embedding 更稳妥的方式是直接请求：

```bash
EMBEDDINGS_URL=https://open.bigmodel.cn/api/paas/v4/embeddings
```

不要简单把 `EMBEDDINGS_URL` 当成 LangChain `OpenAIEmbeddings` 的 `baseURL` 传进去。

原因是 `OpenAIEmbeddings` 会自己拼接 embedding 路径，如果直接把完整 `/embeddings` 端点作为 baseURL，可能会导致路径重复或 404。

## 坑 3：最危险的是“没有报错，但向量全是 0”

这次最容易误导人的现象是：

- Milvus 有数据
- `vector` 字段显示 `Vector[512]`
- 但是展开后发现向量几乎都是 `0`

进一步用脚本验证后发现，这不是 UI 展示问题，而是真实写入了全 0 向量。

问题在于：通过 LangChain `OpenAIEmbeddings` 走 GLM 兼容 baseURL 时，请求没有直接报错，但返回的 embedding 是全 0。

这类问题很危险，因为它会让插入流程看起来成功，但语义检索实际已经失效。

## 正确验证方式

不要只看“插入了几条”，还要检查向量质量：

```js
const vector = await getEmbedding('测试文本');
console.log('维度:', vector.length);
console.log('非零维度:', vector.filter((value) => value !== 0).length);
console.log('前 20 维:', vector.slice(0, 20));
```

这次直接请求 GLM embedding 端点后，返回结果是：

```text
维度: 2048
非零维度: 2047/2048
```

这说明 GLM `embedding-3` 的真实输出是 2048 维非零向量，而不是之前错误链路里的 512 维全 0 向量。

## 当前 pro 版策略

为了不影响原始学习 demo，增强逻辑放在：

```bash
examples/memory-test/src/memory/retrieval-memory.pro.mjs
```

这个 pro 版做了几件事：

- 如果配置了 `EMBEDDINGS_URL`，就直接用 HTTP 请求 embedding 专用端点
- 如果没有配置 `EMBEDDINGS_URL`，才回退到 LangChain `OpenAIEmbeddings`
- 每次查询前检查向量是否全 0
- 每次查询前检查查询向量维度是否和 Milvus collection 维度一致
- 每次把新对话写回 Milvus 前，也做同样的非零和维度检查

## 经验总结

这次踩坑让我意识到，RAG 里 embedding 层不能只验证“请求成功”。

更靠谱的最小检查应该包括：

1. embedding 请求是否成功
2. 返回向量维度是否符合预期
3. 非零维度是否正常
4. Milvus collection 的 `dim` 是否等于真实 `vector.length`
5. 检索结果的相似度是否有区分度

如果向量全是 0，那么后面的 Milvus、RAG、Prompt 写得再好都没用，因为最底层的语义表示已经失效了。
