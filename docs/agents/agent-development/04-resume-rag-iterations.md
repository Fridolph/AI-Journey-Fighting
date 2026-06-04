# 简历 RAG 七次迭代：一个真实项目的完整进化

## 开篇

前面讲 RAG 的时候，用的都是《天龙八部》电子书——文档结构简单、内容单一。但真实项目远比这复杂。

这篇文章记录了一个完整项目的进化过程：如何从"把简历丢进向量库就能问答"的 naive 想法，经过七次迭代，最终做成了一个能理解上下文、区分主次证据、流式返回结果的智能简历助手。

这不是一个"直接给出最佳实践"的文章，而是一个**真实踩坑与迭代的记录**。每一版解决一个问题，每一版也会引入新的问题——这就是工程化的本质。

> 代码来自 `examples/resume-memory-rag-qa/`。

---

## v1：字段拆分 —— 不要整篇切块

### 问题

最直接的想法是把整份简历 markdown 用 `RecursiveCharacterTextSplitter` 切成 500 字符的块，丢进向量库。

但简历是有强结构的文档：

```
# 基本信息              ← 短文本，不需要切
# 核心竞争力            ← 关键段落
## AI Agent 开发        ← 子技能
# 工作经历              ← 结构化信息
## 澳昇科技（2020-2023）  ← 每个经历独立
# 核心项目经验           ← 每个项目应独立检索
```

如果一刀切 500 字符，可能出现：
- 一个技能描述被切成两半
- 两个不同项目被混在一个 chunk 里
- 检索"AI Agent 经验"时，因为 chunk 里混杂了无关内容而降低相关性分数

### 方案：先拆字段，再切长内容

```js
// 第一步：按业务结构拆分
const sections = parseResume(markdown)
// → { basicInfo: {...}, skills: [...], workExperience: [...], projects: [...] }

// 第二步：每个 section 作为独立记录
for (const skill of sections.skills) {
  records.push({
    section: 'skills',
    subsection: skill.category,      // 'ai-agent', 'frontend'
    entity_type: 'skill_item',
    title: skill.name,
    content: skill.description,
    tags: skill.tags.join(','),
  })
}

// 第三步：只有长内容（如项目描述）再做 chunk
if (project.summary.length > 800) {
  const chunks = splitter.splitText(project.summary)
  // ...
}
```

代码位置：`examples/resume-memory-rag-qa/src/resume-parser.mjs`

### 为什么这比一刀切好

| 检索问题 | 一刀切 | 字段拆分 |
|----------|--------|----------|
| "会哪些 AI 相关技术？" | 可能命中项目描述里的 AI 字眼 | 直接命中 `skills/ai-agent` 记录 |
| "在某公司做过什么？" | 依赖 chunk 里恰好包含公司名 | 直接命中对应 `workExperience` 记录 |
| "有管理经验吗？" | 全文漫无目的搜索 | 精确命中 `coreCompetency` 或 `workExperience.title` |

---

## v2：检索策略优化 —— 不能只靠向量相似度

### 问题

v1 跑起来后，遇到一个典型现象：问"有没有 AI Agent 开发经验"时，排在第一位的是 `skills/ai-agent`（分数 0.91），这很好。但排在第二、第三的是不相关的项目经历——因为向量相似度"也不算差"。

**纯向量召回的局限**：和当前问题语义有点关系的都会回来，但"有点关系"不等于"对回答有用"。

### 方案：section 加权 + 重排序

```js
const SECTION_WEIGHTS = {
  'skills': 0.7,              // 技能片段：降权
  'coreCompetency': 1.2,      // 核心竞争力：升权
  'workExperience': 1.0,
  'project': 1.3,             // 项目经历：升权（通常最相关）
  'education': 0.6,
  'basicInfo': 0.5,
}

const adjustedScore = result.score * (SECTION_WEIGHTS[result.section] ?? 1.0)
```

代码位置：`examples/resume-memory-rag-qa/src/ask-resume-v2.mjs`

但这还不够。向量分数高的 skills 片段即使乘了 0.7，仍然可能排在项目经历前面。所以还需要**语义相关性二次判断**——让 LLM 判断每个片段是否和问题真正相关。

---

## v3：管线化重构 —— 把步骤拆成可替换的模块

### 问题

v2 的 `ask-resume-v2.mjs` 把检索、过滤、Prompt 拼装、LLM 调用全写在一个文件里。每改一个策略就要改整个文件。

### 方案：拆成三大模块

```js
// retriever.js —— 只负责"从向量库找相关片段"
class ResumeRetriever {
  async retrieve(query: string, filters?: SearchFilters): Promise<ResultItem[]>
}

// prompt-builder.js —— 只负责"把片段组建成 prompt"
class ResumePromptBuilder {
  build(system: string, context: string[], query: string): BaseMessage[]
}

// rag-pipeline.js —— 串联整个流程
class RAGPipeline {
  async ask(query: string): Promise<string> {
    const results = await this.retriever.retrieve(query)
    const messages = this.promptBuilder.build(/*...*/)
    return await this.model.invoke(messages)
  }
}
```

代码位置：`examples/resume-memory-rag-qa/src/ask-resume-v3.mjs`

**管线化的核心价值**：每个模块独立可测试、独立可替换。想换一个检索策略？只改 `retriever`。想换一种 prompt 格式？只改 `prompt-builder`。

---

## v4：会话存储 + Prompt 目录化 + 噪声过滤

### 问题一：没有记忆

多轮对话时每轮都是从零开始，不记得之前问过什么。结合前面 Memory 章节的知识，加入会话历史持久化：

```js
// 按 sessionId 存储每轮对话
const history = new FileSystemChatMessageHistory({
  filePath: `sessions/${sessionId}.json`,
})
```

### 问题二：Prompt 散落在代码里

v3 的 system prompt 是硬编码字符串。v4 改为从 `prompts/` 目录加载，支持按场景切换：

```
prompts/
├── default.md       # 默认助手 prompt
├── recruiter.md     # 面试官视角 prompt
└── technical.md     # 技术评估 prompt
```

### 问题三：检索结果混入无关片段

v4 引入了基础的噪声过滤：

```js
function noiseCheck(item: ResultItem): boolean {
  // 分数太低？
  if (item.score < MIN_SCORE_THRESHOLD) return true
  // section 不匹配预期？
  if (item.section === 'education' && !queryContains('学历', '学校')) return true
  return false
}
```

代码位置：`examples/resume-memory-rag-qa/src/ask-resume-v4.mjs`

---

## v5：策略配置外置 + 上下文构建拆分

### 问题

v4 的权重、阈值全写在代码里。调一次参数就要改代码、重新部署。

### 方案：配置外置

```json
// config/retrieval.json
{
  "sectionWeights": { "skills": 0.7, "project": 1.3 },
  "minScore": 0.65,
  "topK": 10,
  "noiseRules": [
    { "section": "education", "unlessKeywords": ["学历", "学校", "专业"] }
  ]
}
```

同时把上下文构建逻辑从 prompt-builder 里拆出来——检索结果是一个数据结构，怎么"说"给 LLM 是另一件事：

```js
// context-builder.js：把 ResultItem[] 转成可读的上下文文本
function buildContext(results: ResultItem[]): string {
  return results.map(r =>
    `[${r.section}/${r.subsection}] ${r.title}\n${r.content}`
  ).join('\n---\n')
}
```

代码位置：`examples/resume-memory-rag-qa/src/ask-resume-v5.mjs`

---

## v6：主证据优先 + 精细去噪

### 问题

v5 的过滤还是太"软"。某些和问题关系不强的项目（比如"LC 安全分析大屏"在问 AI Agent 经验时）仍然进入了最终上下文，只是因为"它在 projects section 里，分数不算太差"。

### 方案：primary evidence vs support evidence

```js
const evidence = results.map(r => ({
  ...r,
  evidenceLevel: determineEvidenceLevel(r, query),
  // 'primary' — 主题强相关，应作为回答的主要依据
  // 'support'  — 有一定相关性，可作为辅助说明
  // 'noise'    — 无关，应排除
}))

function determineEvidenceLevel(item, query) {
  // 1. 问的是技能 → skills section 可以成为 primary
  // 2. 问的是项目经验 → projects 里的相关项目是 primary
  // 3. section 权重 + topic hit + score 综合判断
  if (item.topicHit && item.section === expectedSection(query)) return 'primary'
  if (item.score > 0.75) return 'support'
  return 'noise'
}
```

代码位置：`examples/resume-memory-rag-qa/src/ask-resume-v6.mjs`

**v6 的核心进步**：从"打分过滤"升级为"证据分层"，LLM 在回答时知道哪些是主要依据、哪些是辅助信息。

---

## v7：跨区补证 + 流式进度反馈

### 问题一：误杀补充证据

v6 的"主证据优先"太激进——如果一个 skills 片段和问题高度相关（比如 `skills/ai-agent`，score=0.91），但问题类型是"项目经验"，它就会被压制。这导致一些高相关的补充证据也一起被误杀了。

### 方案：跨区补证（cross-section supplement）

```js
function crossSectionSupplement(primaryEvidence, allResults) {
  // skills 不应该抢主位，但高度相关的 skills 可以作为"补充证据"
  for (const item of allResults) {
    if (item.evidenceLevel !== 'primary' &&
        item.score > CROSS_SECTION_SCORE_THRESHOLD &&
        item.topicHit) {
      item.evidenceLevel = 'cross-support'  // 跨区补证
    }
  }
}
```

### 问题二：用户等待期间无反馈

v6 的完整流程（检索 + LLM 生成）可能需要 5-10 秒。v7 加入了流式进度反馈：

```
⏳ 正在检索相关文档...
✅ 找到 8 条相关，主证据 3 条，补证 2 条
📝 正在生成回答...
[流式输出] 该候选人具备 3 年以上 AI Agent 开发经验...
✅ 回答完成
```

代码位置：`examples/resume-memory-rag-qa/src/ask-resume-v7.mjs`

---

## 迭代总结

| 版本 | 核心改进 | 解决的问题 |
|------|---------|-----------|
| v1 | 字段拆分 | 整篇切块导致检索不准 |
| v2 | section 加权 + 重排 | 纯向量召回噪声多 |
| v3 | 管线化重构 | 代码耦合，难以迭代 |
| v4 | 会话存储 + Prompt 目录化 + 噪声过滤 | 无记忆、配置散乱、噪声混入 |
| v5 | 配置外置 + 上下文构建拆分 | 参数硬编码、上下文组织混乱 |
| v6 | 主证据优先 + 精细去噪 | 无关项目仍混入最终上下文 |
| v7 | 跨区补证 + 流式进度反馈 | 误杀补充证据、用户无反馈感知 |

**三个最重要的工程认知**：

1. **检索不是终点**——召回后的重排、过滤、证据分层比检索本身更影响回答质量
2. **管线化是迭代的前提**——不拆开就没法独立优化，每次改动都会牵动全局
3. **RAG 的优化是钟摆运动**——v6 压太狠就在 v7 松一点，永远在"精准"和"召回"之间找平衡

---

## 相关代码文件

| 文件 | 说明 |
|------|------|
| `examples/resume-memory-rag-qa/src/resume-parser.mjs` | 简历字段拆分 |
| `examples/resume-memory-rag-qa/src/ingest-resume.mjs` | 写入 Milvus |
| `examples/resume-memory-rag-qa/src/ask-resume.mjs` | v1 基础问答 |
| `examples/resume-memory-rag-qa/src/ask-resume-v2.mjs` | v2 section 加权 |
| `examples/resume-memory-rag-qa/src/ask-resume-v{3-7}.mjs` | v3-v7 迭代 |
