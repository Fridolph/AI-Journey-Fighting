# Agent 的记忆系统：History 与三大策略

## 开篇

上一篇文章里，我们让 Agent 学会了"做事"——通过 Tool Calling 扩展外部能力。但你可能会发现一个问题：

```
用户："我叫张三，喜欢打篮球"
Agent："记住了！"
用户："我叫什么名字？"
Agent："抱歉，我无法确定您的名字。"  ← 忘了
```

**大模型本身是无状态的。** 每一次 API 调用都是独立的——它不记得上一次对话说了什么，它甚至不知道"上一次对话"的存在。

所谓的"记忆"，本质上是**你的程序在管理消息历史**，然后在下一次调用时把这些历史重新喂给模型。

这篇文章沿着两条线来讲 Memory：
1. **存储层**——消息存在哪里（内存 / 文件 / 数据库）
2. **管理策略**——上下文太长后怎么取舍（截断 / 总结 / 检索）

> 代码来自 `examples/memory-test/`。

---

## 一、最基础的内存：把上一次对话传回去

先看最简单的实现。在 `history-test.mjs` 中：

```js
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

const history = new InMemoryChatMessageHistory()

// 第一轮
await history.addMessage(new HumanMessage('红烧肉怎么做？'))
const messages = [new SystemMessage('你是一个中餐厨师'), ...await history.getMessages()]
const reply1 = await model.invoke(messages)
await history.addMessage(reply1)

// 第二轮 —— 因为上一轮的消息重新喂给了模型，它能"记得"
await history.addMessage(new HumanMessage('需要哪些食材？'))
const messages2 = [new SystemMessage('你是一个中餐厨师'), ...await history.getMessages()]
const reply2 = await model.invoke(messages2)
```

代码位置：`examples/memory-test/src/history-test.mjs`

核心就三步：
1. 每次对话，把 `HumanMessage` 写入 `history`
2. 调用模型时，把 `history.getMessages()` 取出来塞进 `messages` 数组
3. 模型的回答也写回 `history`

**Memory 不是"模型突然变聪明了"，而是你把过去的上下文重新传给了它。**

但 `InMemoryChatMessageHistory` 有一个致命问题：**进程结束，记忆全丢**。

---

## 二、持久化：让记忆活过下一次重启

`FileSystemChatMessageHistory` 把消息写入本地文件：

```js
import { FileSystemChatMessageHistory } from '@langchain/core/chat_history'

const history = new FileSystemChatMessageHistory({
  filePath: './chat_history.json',
})

// 第一轮对话
await history.addMessage(new HumanMessage('红烧肉怎么做？'))
// ...
await history.addMessage(aiMessage)

// → chat_history.json 文件里持久化保存了完整消息
```

代码位置：`examples/memory-test/src/history-test2.mjs`

下次运行脚本时，指定同一个 `filePath`，`getMessages()` 就能恢复之前的全部对话：

```js
const history = new FileSystemChatMessageHistory({
  filePath: './chat_history.json',
})

const pastMessages = await history.getMessages()
// 前两轮的消息都在，模型可以接着聊
```

代码位置：`examples/memory-test/src/history-test3.mjs`

这就是长时记忆（LTM）的雏形。生产环境中，文件可以替换为 Redis、MySQL 等存储。

---

## 三、上下文太长怎么办？三大管理策略

文件持久化解决了"记忆不丢"的问题，但带来了新问题：

**对话越来越长 → token 超限 → 模型拒绝响应。**

就像你跟一个人聊了 3 个小时，不可能在下一句话里把 3 小时的内容全部复述一遍。你需要**选择性回顾**。

Memory 管理的三种主流策略就对应三种"选择性回顾"的方式：

### 策略 1：截断（Truncation）——只记最近的

最简单粗暴的方案：只保留最近 N 条消息。

```js
const MAX_MESSAGES = 10
const recentMessages = allMessages.slice(-MAX_MESSAGES)
// 前 10 轮的内容直接丢弃
```

代码位置：`examples/memory-test/src/memory/truncation-memory.mjs`

更合理的做法是按 token 数截断（因为模型的限制是按 token 算的）：

```js
import { trimMessages } from '@langchain/core/messages'

const trimmed = trimMessages(allMessages, {
  maxTokens: 4000,
  strategy: 'last',
  tokenCounter: (msgs) => msgs.reduce((sum, m) => sum + estimateTokens(m.content), 0),
})
```

**适用场景**：短对话、对历史依赖不强的场景。聊天机器人常用。

**缺点**：直接丢弃旧消息，如果早期对话里有关键信息（比如用户在第一句说了名字），截断后就丢了。

### 策略 2：总结（Summarization）——让 LLM 归纳过去

不是直接丢弃，而是让 LLM 把旧消息浓缩成一段摘要：

```
旧消息（前 20 轮对话）
    ↓ LLM 总结
"用户叫张三，喜欢打篮球和玩游戏。
 之前讨论过红烧肉的做法..."
    ↓ 拼上最近 3 轮对话
完整上下文 = 摘要 + 最近消息 → 喂给模型
```

```js
const SUMMARY_PROMPT = `请将以下对话历史总结为一段简洁的描述，保留关键信息：`

async function summarizeHistory(messages) {
  const text = messages.map(m =>
    `${m._getType() === 'human' ? '用户' : '助手'}：${m.content}`
  ).join('\n')

  const result = await model.invoke([
    new SystemMessage(SUMMARY_PROMPT),
    new HumanMessage(text),
  ])
  return result.content
}
```

代码位置：`examples/memory-test/src/memory/summarization-memory.mjs`

**优点**：比截断保留更多上下文。长对话场景下，摘要能涵盖早期的关键信息。

**缺点**：多了一次 LLM 调用（成本 + 延迟）。摘要可能丢失细节。

升级版：按 token 量触发总结 + 保留最近 N 条原始消息。这样既有"故事梗概"又有"最近细节"：

```js
if (currentTokens > MAX_TOKENS) {
  const toSummarize = allMessages.slice(0, -RECENT_COUNT)
  const recent = allMessages.slice(-RECENT_COUNT)
  const summary = await summarizeHistory(toSummarize)
  // 新上下文 = 摘要（SystemMessage） + 最近消息
}
```

代码位置：`examples/memory-test/src/memory/summarization-memory2.mjs`

### 策略 3：检索（Retrieval）——需要什么找什么

截断和总结都是"压缩"，各有各的丢失。检索是一种完全不同的思路：

**不压缩。把全部历史存进向量数据库，每次只取最相关的那几条。**

```
全部对话历史
    ↓ 存入 Milvus（向量数据库）
"我叫张三"（向量 A）
"喜欢打篮球"（向量 B）
"红烧肉怎么做"（向量 C）
...
    ↓ 用户问"我叫什么名字？"
检索和当前问题语义最相似的 Top 3
    ↓ 只喂给模型这 3 条
```

```js
// 把每条对话记录存入 Milvus
await milvusClient.insert({
  collection_name: 'conversation_memory',
  data: [{
    content: '我叫张三',
    embedding: await embeddings.embedQuery('我叫张三'),
    session_id: 'user-1',
    timestamp: Date.now(),
  }],
})

// 检索最相关的历史
const queryEmbedding = await embeddings.embedQuery('我叫什么名字？')
const results = await milvusClient.search({
  collection_name: 'conversation_memory',
  vector: queryEmbedding,
  limit: 3,
})
```

代码位置：`examples/memory-test/src/memory/retrieval-memory.mjs`

**优点**：理论上能记住无限长的对话。只取相关的，不相关的自动过滤。

**缺点**：依赖向量数据库。语义检索的精度影响回答质量。

---

## 四、三种策略对比

| 策略 | 原理 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|---------|
| 截断 | 只保留最近 N 条 | 简单、低成本 | 丢失早期信息 | 短对话、客服 |
| 总结 | LLM 归纳旧消息为摘要 | 保留关键信息 | 多一次 LLM 调用 | 中长对话、个人助手 |
| 检索 | 向量检索取最相关 | 理论无限记忆 | 依赖向量库 | 知识密集型对话 |

在实际项目中，这三种策略常常组合使用。比如：

```
当前上下文 = 最近 5 轮对话（截断）
            + 历史对话摘要（总结）
            + 向量检索到的 3 条相关记录（检索）
```

这其实就是后面简历 RAG 项目中所用到的"混合记忆"策略的基础。

---

## 五、小结

Memory 的核心认知：

1. **模型本身没有记忆**——是程序在管理上下文历史
2. **Memory 的本质** = 你如何保存和筛选喂给模型的上下文
3. **持久化**决定记忆能活多久（内存 / 文件 / 数据库）
4. **管理策略**决定记忆的质量（截断 / 总结 / 检索）

在下一篇文章里，我们会遇到一个更广阔的场景——不是记住对话，而是让 Agent 去检索海量外部知识。这也就是 RAG（检索增强生成）的核心。

---

## 相关代码文件

| 文件 | 说明 |
|------|------|
| `examples/memory-test/src/history-test.mjs` | 短时记忆（InMemory） |
| `examples/memory-test/src/history-test2.mjs` | 长时记忆（文件持久化） |
| `examples/memory-test/src/history-test3.mjs` | 从文件恢复历史继续对话 |
| `examples/memory-test/src/memory/truncation-memory.mjs` | 截断策略（按条数 + 按 token） |
| `examples/memory-test/src/memory/summarization-memory.mjs` | 总结策略 v1（按消息数触发） |
| `examples/memory-test/src/memory/summarization-memory2.mjs` | 总结策略 v2（按 token 触发） |
| `examples/memory-test/src/memory/retrieval-memory.mjs` | 检索策略（Milvus 向量库） |
