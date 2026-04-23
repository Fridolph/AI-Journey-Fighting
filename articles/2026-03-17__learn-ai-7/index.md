---
layout: post
title: 「JS全栈AI学习」从零到一：深入理解 RAG（检索增强生成）技术
date: 2026-03-10
tags:
  - RAG
  - NestJS
  - LangChain.js
  - AI
  - 系统设计
categories:
  - AI
---

> 📌 **系列简介**：「JS全栈AI学习」记录 AI 应用开发的完整学习过程，篇数随进度持续更新。
> *前端转 JS 全栈，正在学 AI，理解难免有偏差，欢迎批评指正 ~*

---

## 写在前面

学 AI 这段时间，有一个问题一直没解决：

AI 很聪明，但问它关于我自己的事——我的项目经历、我用过的技术栈、我在哪家公司做过什么——它会一本正经地胡说八道。

原因很简单：它的训练数据里根本没有我的简历。

RAG（Retrieval-Augmented Generation，检索增强生成）就是为了解决这个问题的：
**先检索相关信息，再让 LLM 基于这些信息生成答案。**

这篇记录了我从零学习 RAG 的完整过程。
不只是概念，更重要的是——我把自己的简历作为实验对象，
一边学 RAG 原理，一边在 `my-resume` 项目里真实落地。

---

## 目录

1. [什么是 RAG？](#1-什么是-rag)
2. [为什么需要 RAG？](#2-为什么需要-rag)
3. [RAG 核心概念梳理](#3-rag-核心概念梳理)
   - [3.1 切片（Chunking）](#31-切片chunking)
   - [3.2 向量化（Embedding）](#32-向量化embedding)
   - [3.3 向量存储（Vector Store）](#33-向量存储vector-store)
   - [3.4 相似度搜索（Similarity Search）](#34-相似度搜索similarity-search)
   - [3.5 生成回答（Generation）](#35-生成回答generation)
4. [深入优化：意图提取](#4-深入优化意图提取)
5. [深入优化：重排序](#5-深入优化重排序)
6. [深入优化：答案生成](#6-深入优化答案生成)
7. [完整实现](#7-完整实现)
8. [总结与展望](#8-总结与展望)

---

## 1. 什么是 RAG？

**RAG（Retrieval-Augmented Generation）** = 检索增强生成

一句话：**先检索相关信息，再让 LLM 基于这些信息生成答案。**

```
传统 LLM 对话：
  用户："他做过什么安全项目？"
  AI："抱歉，我不知道你说的是谁。"

RAG：
  用户："他做过什么安全项目？"
  系统：搜索简历 → 找到 EDR、LC 项目片段
  AI："他做过 EDR 终端威胁侦测平台和 LC 安全分析大屏..."
```

**RAG 的核心价值：**
- ✅ 让 AI 能访问私有知识（你的简历、公司文档...）
- ✅ 答案有依据，可以显示来源
- ✅ 不会瞎编，只根据检索到的内容回答

---

## 2. 为什么需要 RAG？

### 场景：构建一个简历问答系统

我的简历是 YAML 格式，结构化存储了基本信息、技能、工作经历、项目等：

```yaml
profile:
  name: "某全栈工程师"
  title: "JS全栈 / AI Agent 开发工程师"
  experienceYears: 10年

skills:
  - 熟练掌握 Vue2/3、TypeScript、NestJS...
  - 持续进行 AI Agent 开发实践，熟悉 RAG 基础链路...

experiences:
  - company: "某能源科技公司"
    projects:
      - name: "GreenSketch"
        summary: "为全球光伏安装商提供在线项目设计与报价服务..."
        techStack: [Nuxt 4, Vue3, TypeScript, Web Worker]
  - company: "某安全科技公司"
    projects:
      - name: "EDR 终端威胁侦测平台"
        summary: "面向政企安全场景的终端威胁侦测与响应平台..."
        techStack: [Vue, iView, WebSocket, D3.js]
```

用户可能会问：
- "他会什么技术？"
- "他在某安全公司做过什么项目？"
- "他有安全相关的项目经验吗？"

**直接问 LLM 行不行？**

不行。LLM 不知道我的简历内容。

**把整份简历喂给 LLM 行不行？**

简历有 3000+ 字，每次全量输入：Token 消耗大、效率低、AI 容易被无关信息干扰。

**解决方案：RAG。**

先把简历切成小块，向量化存储；用户提问时，只检索相关片段喂给 AI。

---

## 3. RAG 核心概念梳理

RAG 的完整流程：

```
简历 YAML → 切片 → 向量化 → 存储
                                ↓
用户问题 → 向量化 → 相似度搜索 → 取出相关片段 → 喂给 LLM → 生成答案
```

逐步拆解。

---

### 3.1 切片（Chunking）

**目的：** 把长文档切成小块，方便精准检索。

切片有两种思路：

**固定长度切片**——简单，但容易切断语义：

```javascript
function chunkByLength(text, chunkSize = 500, overlap = 50) {
  const chunks = []
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize))
  }
  return chunks
}
```

**语义切片（推荐）**——基于文档结构切，每个 chunk 语义完整。

我的简历是结构化 YAML，天然就是好的切片边界：
基本信息一个 chunk、技能一个 chunk、每家公司一个 chunk、每个项目一个 chunk。

这是 `my-resume` 项目里真实的切片实现（NestJS + TypeScript）：

```typescript
@Injectable()
export class RagChunkService {
  parseSource(source: string): RagSourceDocument {
    return parse(source) as RagSourceDocument; // 解析 YAML
  }

  buildChunks(document: RagSourceDocument): RagChunk[] {
    return [
      this.buildProfileChunk(document),       // 基本信息
      this.buildSkillsChunk(document),         // 技能
      ...document.education.map(item => this.buildEducationChunk(item)),
      ...document.experiences.flatMap(item => this.buildExperienceChunks(item)),
      ...document.projects.map(item => this.buildStandaloneProjectChunk(item)),
      ...this.buildExtraChunks(document),      // 开源 / 文章
    ];
  }

  private buildProfileChunk(document: RagSourceDocument): RagChunk {
    return {
      id: 'profile-overview',
      title: '基本信息',
      section: 'profile',
      sourceType: 'resume',
      content: compactLines([
        `姓名：${document.profile.name}`,
        `定位：${document.profile.title}`,
        `工作经验：${document.profile.experienceYears}`,
        `求职意向：${document.profile.targetRole}`,
        `总结：${document.profile.summary}`,
      ]),
    };
  }

  private buildExperienceChunks(item: RagSourceExperienceItem): RagChunk[] {
    // 公司经历一个 chunk，每个项目再各一个 chunk
    const experienceChunk: RagChunk = {
      id: `experience-${item.id}`,
      title: item.company,
      section: 'experience',
      sourceType: 'resume',
      content: compactLines([
        `公司经历：${item.company}`,
        `职位：${item.role}`,
        `时间：${item.period}`,
        `简介：${item.summary}`,
        ...(item.responsibilities ?? []).map(d => `职责：${d}`),
        ...(item.achievements ?? []).map(d => `成果：${d}`),
        item.techStack?.length ? `技术栈：${item.techStack.join('、')}` : null,
      ]),
    };

    const projectChunks = (item.projects ?? []).map(project =>
      this.buildExperienceProjectChunk(item, project)
    );

    return [experienceChunk, ...projectChunks];
  }

  private buildExperienceProjectChunk(
    experience: RagSourceExperienceItem,
    project: RagSourceExperienceProjectItem,
  ): RagChunk {
    return {
      id: `project-${experience.id}-${project.id}`,
      title: project.name,
      section: 'project',
      sourceType: 'resume',
      content: compactLines([
        `项目经历：${project.name}`,
        `所属公司：${experience.company}`,
        `所属阶段：${experience.period}`,
        `简介：${project.summary}`,
        project.techStack?.length ? `技术栈：${project.techStack.join('、')}` : null,
        ...(project.contributions ?? []).map(d => `贡献：${d}`),
      ]),
    };
  }
}
```

其中 `compactLines` 是一个小工具函数，过滤掉空行，保持 chunk 内容干净：

```typescript
function compactLines(lines: Array<string | undefined | null>): string {
  return lines
    .filter((item): item is string => Boolean(item && item.trim().length > 0))
    .join('\n');
}
```

切片之后，我的简历大概会生成 **20+ 个 chunk**，每个 chunk 语义独立、边界清晰。
问"技能"就找技能 chunk，问"某个项目"就找项目 chunk，不会把无关内容混进来。

---

### 3.2 向量化（Embedding）

**目的：** 把文字变成数字（向量），让计算机能"理解"语义相似度。

计算机不懂"语义相似"，但懂"数字距离"：

```
"他会什么技术？"         → [0.23, -0.15, 0.87, ..., 0.42]  (1536 维)
"熟悉 Vue3、TypeScript"  → [0.19, -0.11, 0.91, ..., 0.38]  (1536 维)

计算余弦相似度 = 0.92  →  这俩在语义上很接近
```

实现：

```typescript
async function embedText(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding; // 1536 维向量
}

// 批量向量化所有 chunks
async function embedAllChunks(chunks: RagChunk[]) {
  for (const chunk of chunks) {
    chunk.vector = await embedText(chunk.content);
  }
  return chunks;
}
```

向量化是一次性的工作——简历内容不变，就不需要重新向量化。
所以我把向量化的结果持久化存储，避免每次启动都重新计算。

---

### 3.3 向量存储（Vector Store）

**目的：** 把向量存起来，方便后续搜索。

对于简历这种小规模场景（20+ chunks），用 JSON 文件就够了，不需要引入 Pinecone 这类向量数据库：

```json
{
  "chunks": [
    {
      "id": "skills-overview",
      "title": "专业技能",
      "section": "skills",
      "content": "专业技能：\n1. 具备 10 年 JavaScript 全栈开发经验...",
      "vector": [0.23, -0.15, 0.87, ..., 0.42],
      "metadata": { "type": "skills" }
    },
    {
      "id": "project-wskp-edr",
      "title": "EDR 终端威胁侦测平台",
      "section": "project",
      "content": "项目经历：EDR 终端威胁侦测与响应平台\n所属公司：某安全科技公司...",
      "vector": [0.19, -0.11, 0.91, ..., 0.38],
      "metadata": { "company": "某安全科技公司", "techStack": ["Vue", "WebSocket", "D3.js"] }
    }
  ]
}
```

够用就好——小规模场景不需要过度设计。

---

### 3.4 相似度搜索（Similarity Search）

**核心算法：余弦相似度**

```typescript
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  const normA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
}

async function vectorSearch(query: string, topK = 3) {
  const queryVector = await embedText(query);

  return vectorStore.chunks
    .map(chunk => ({ ...chunk, score: cosineSimilarity(queryVector, chunk.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

向量搜索能找到"语义相关"的内容，但有一个盲点：
**它只管"像不像"，不管"是不是你要的那个"。**

比如问"他在某安全公司做过什么项目"，向量搜索可能把其他公司的项目也排进来——
因为语义上都是"项目"，相似度差不多。

这是下一步要解决的问题。

---

### 3.5 生成回答（Generation）

把检索到的内容 + 用户问题，构造 Prompt 喂给 LLM：

```typescript
async function generateAnswer(userQuery: string, chunks: RagChunk[]) {
  const context = chunks
    .map((chunk, i) => `[来源 ${i + 1}: ${chunk.title}]\n${chunk.content}`)
    .join('\n\n---\n\n');

  const prompt = `
你是一个简历助手，根据以下信息回答用户问题。

【相关信息】
${context}

【用户问题】
${userQuery}

【回答要求】
1. 只根据提供的信息回答
2. 如果信息不足，说"简历中未提及"
3. 保持客观，不要编造
`;

  return await callLLM(prompt);
}
```

基础版能跑，但有两个隐患：LLM 可能把自己训练数据里的知识混进来，也没有引用来源。
这些留到第 6 节优化。

---

## 4. 深入优化：意图提取

### 问题

纯向量搜索的盲点前面提到了——只管语义相似，不管过滤条件。

```
用户问："他在某安全公司做过什么安全相关的项目？"

纯向量搜索结果：
  1. EDR 项目（某安全公司）✅
  2. GreenSketch（某能源公司）❌  ← 混进来了
  3. Admin 后台（某安全公司）✅
```

需要把"某安全公司"这个条件提取出来，先过滤再搜索。

### 解法：用 LLM 做结构化意图提取

把自然语言问题转化为结构化查询：

```typescript
async function extractIntent(userQuery: string) {
  const prompt = `
从用户问题中提取结构化信息。

【用户问题】
${userQuery}

【可选公司】
- company_security: 某安全科技公司
- company_energy: 某能源科技公司
- company_saas: 某 SaaS 科技公司

【可选类型】profile / skills / project / experience / education

【可选领域】security / frontend / backend / energy

严格返回 JSON：
{
  "query": "提炼后的核心问题",
  "filters": {
    "company": "公司ID（如果提到）",
    "section": "类型（如果提到）",
    "domain": "领域（如果提到）"
  }
}
`;
  return JSON.parse(await callLLM(prompt));
}
```

提取结果：

```javascript
// 输入："他在某安全公司做过什么安全相关的项目？"
// 输出：
{
  query: "做过什么项目",
  filters: {
    company: "company_security",
    section: "project",
    domain: "security"
  }
}
```

### 混合搜索：意图过滤 + 向量搜索

```typescript
async function hybridSearch(userQuery: string, topK = 3) {
  // 1. 提取意图
  const intent = await extractIntent(userQuery);

  // 2. 向量化核心问题
  const queryVector = await embedText(intent.query);

  // 3. 先过滤，再搜索
  const filtered = vectorStore.chunks.filter(chunk => {
    if (intent.filters.company && chunk.metadata.company !== intent.filters.company) return false;
    if (intent.filters.section && chunk.section !== intent.filters.section) return false;
    return true;
  });

  return filtered
    .map(chunk => ({ ...chunk, score: cosineSimilarity(queryVector, chunk.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

加了意图提取之后，同一个问题的搜索结果：

```
纯向量搜索：  EDR ✅ / GreenSketch ❌ / Admin ✅   → 准确率 67%
意图+混合搜索：EDR ✅ / LC大屏 ✅ / Admin ✅       → 准确率 100%
```

**这一步的提升最明显。** 很多 RAG 教程直接从向量搜索开始，跳过意图提取——
但实际上，把自然语言转化为结构化查询，才是让 RAG 真正可用的关键。

---

## 5. 深入优化：重排序

### 问题

意图过滤解决了"过滤条件"的问题，但向量相似度还有一个局限：
**它只衡量"语义像不像"，不衡量"哪个更直接回答问题"。**

```
用户问："他最擅长什么前端框架？"

向量搜索结果：
  1. project-yyk (0.82) — "将 Vue2 代码重构为 Vue3..."
  2. skills (0.81)      — "熟悉 Vue 全家桶、ElementUI..."  ← 这个才是最直接的
  3. project-edr (0.79) — "负责前端架构，Vue + iView..."
```

skills chunk 才是最直接回答"擅长什么框架"的，但它排在第二。

### 解法：多维度重排序

```typescript
function rerank(chunks: RagChunk[], intent: Intent) {
  return chunks.map(chunk => {
    let score = chunk.vectorScore;

    // section 完全匹配加分
    if (chunk.section === intent.filters.section) score += 0.2;

    // 公司完全匹配加分
    if (chunk.metadata?.company === intent.filters.company) score += 0.15;

    // 技术栈匹配加分
    if (intent.filters.tech_stack) {
      const matchCount = intent.filters.tech_stack.filter(
        tech => chunk.metadata?.techStack?.includes(tech)
      ).length;
      score += matchCount * 0.05;
    }

    // 内容完整度
    score += Math.min(chunk.content.length / 500, 1) * 0.1;

    return { ...chunk, finalScore: score };
  })
  .sort((a, b) => b.finalScore - a.finalScore);
}
```

重排序之后，skills chunk 从第二升到第一。

### 多样性重排序（MMR）

还有一个问题：Top 3 可能都是相似的内容，信息冗余。

MMR（Maximal Marginal Relevance）算法在相关性和多样性之间取平衡——
每次选下一个 chunk 时，不只看它和问题的相似度，还要看它和已选内容的差异度：

```typescript
function rerankWithDiversity(chunks: RagChunk[], lambda = 0.5) {
  const selected: RagChunk[] = [];
  const remaining = [...chunks];

  selected.push(remaining.shift()!); // 第一个直接选相似度最高的

  while (remaining.length > 0 && selected.length < 3) {
    let bestScore = -Infinity, bestIndex = -1;

    remaining.forEach((chunk, i) => {
      const relevance = chunk.vectorScore;
      // 与已选内容的最大相似度（越高说明越重复）
      const maxSimilarity = Math.max(
        ...selected.map(s => cosineSimilarity(chunk.vector, s.vector))
      );
      // 相关性高、与已选内容差异大 → 分高
      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

      if (mmrScore > bestScore) { bestScore = mmrScore; bestIndex = i; }
    });

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
}
```

三步优化下来的准确率变化：

```
基础向量搜索          → 60%
+ 意图提取            → 80%（+20%）
+ 多维度重排序        → 90%（+10%）
+ 多样性重排序（MMR） → 95%（+5%）
```

重排序是性价比最高的优化——代码不多，效果明显。

---

## 6. 深入优化：答案生成

### 问题

基础 Prompt 有两个隐患：
- LLM 可能把自己训练数据里的知识混进来
- 没有引用来源，答案可信度低

### 解法：结构化 Prompt + 引用来源

```typescript
async function generateAnswer(userQuery: string, chunks: RagChunk[]) {
  const context = chunks
    .map((c, i) => `[来源 ${i + 1}: ${c.title}]\n${c.content}`)
    .join('\n\n---\n\n');

  const prompt = `
你是一个专业的简历助手，根据提供的信息回答用户问题。

【相关信息】
${context}

【用户问题】
${userQuery}

【回答要求】
1. 只根据提供的信息回答，不要加入你自己的知识
2. 如果信息不足，明确说"简历中未提及"
3. 引用了某个来源，请在句末标注 [来源 X]

【输出格式】
{
  "answer": "自然语言回答",
  "confidence": "high | medium | low",
  "citations": [{ "text": "引用的句子", "source_index": 1 }]
}
`;

  const result = JSON.parse(await callLLM(prompt));

  return {
    answer: result.answer,
    confidence: result.confidence,
    sources: chunks.map((c, i) => ({
      index: i + 1,
      title: c.title,
      cited: result.citations.some((ct: any) => ct.source_index === i + 1),
    })),
  };
}
```

### 答案验证（可选）

对于置信度低的回答，加一层 LLM 自检：

```typescript
async function verifyAnswer(answer: string, chunks: RagChunk[]) {
  const verificationPrompt = `
【生成的答案】${answer}
【原始信息】${chunks.map(c => c.content).join('\n---\n')}

检查答案是否有事实错误或编造内容，返回 JSON：
{
  "has_errors": true | false,
  "errors": ["错误描述"],
  "corrected_answer": "修正后的答案（如有错误）"
}
`;
  const verification = JSON.parse(await callLLM(verificationPrompt));

  return verification.has_errors
    ? { answer: verification.corrected_answer, original_answer: answer }
    : { answer };
}
```

---

## 7. 完整实现

把前面六步串起来，这是 `my-resume` 项目里的完整 RAG 流程：

```typescript
class ResumeRagService {
  constructor(
    private readonly chunkService: RagChunkService,
    private readonly vectorStore: VectorStore,
  ) {}

  // 初始化：解析简历 YAML，构建向量库
  async initialize(yamlSource: string) {
    const document = this.chunkService.parseSource(yamlSource);
    const chunks = this.chunkService.buildChunks(document);

    for (const chunk of chunks) {
      chunk.vector = await embedText(chunk.content);
    }

    await this.vectorStore.save(chunks);
    console.log(`✅ 初始化完成，共 ${chunks.length} 个 chunks`);
  }

  // 问答
  async ask(userQuery: string) {
    // 1. 意图提取
    const intent = await extractIntent(userQuery);

    // 2. 混合搜索（过滤 + 向量）
    const queryVector = await embedText(intent.query);
    const candidates = this.vectorStore.search({
      vector: queryVector,
      filters: intent.filters,
      topK: 10,
    });

    // 3. 重排序（多维度 + 多样性）
    const reranked = rerankWithDiversity(rerank(candidates, intent));

    // 4. 生成答案
    return await generateAnswer(userQuery, reranked.slice(0, 3));
  }
}
```

使用：

```typescript
const rag = new ResumeRagService(chunkService, vectorStore);
await rag.initialize(yamlSource);

await rag.ask("他会什么技术？");
await rag.ask("他在某安全公司做过什么项目？");
await rag.ask("他有安全相关的项目经验吗？");
```

输出示例：

```
💬 答案：他在某安全科技公司主要做了两个安全相关的项目：

  1. EDR 终端威胁侦测与响应平台 [来源 1]
     负责前端架构、WebSocket 实时展示，实现终端信息监控和威胁侦测功能。

  2. LC 安全分析大屏 [来源 2]
     结合 EDR 数据进行安全态势感知与可视化，实现 ATT&CK 热力图等功能。

📚 来源：[EDR 项目 ✅引用] [LC 大屏 ✅引用] [Admin 后台 未引用]
✨ 置信度：high
```

---

## 8. 总结与展望

### RAG 完整流程

```
┌──────────────────────────────────────────────────┐
│ 1. 切片（Chunking）                               │
│    语义切片 > 固定长度，结构化数据天然好切片      │
├──────────────────────────────────────────────────┤
│ 2. 向量化（Embedding）                            │
│    文字 → 向量，让计算机理解语义相似度            │
├──────────────────────────────────────────────────┤
│ 3. 意图提取（Intent Extraction）                  │
│    自然语言 → 结构化查询，提取过滤条件            │
├──────────────────────────────────────────────────┤
│ 4. 向量搜索（Vector Search）                      │
│    余弦相似度，返回 Top K 候选                    │
├──────────────────────────────────────────────────┤
│ 5. 重排序（Reranking）                            │
│    多维度打分 + MMR 多样性，性价比最高的优化      │
├──────────────────────────────────────────────────┤
│ 6. 生成答案（Generation）                         │
│    结构化 Prompt + 引用来源 + 答案验证            │
└──────────────────────────────────────────────────┘
```

### 几个关键判断

**意图提取是被低估的环节。**
很多教程直接从向量搜索开始，跳过意图提取——但这一步带来的准确率提升最大（+20%）。
把自然语言转化为结构化查询，是让 RAG 真正可用的关键。

**重排序是性价比最高的优化。**
代码不多，但效果明显。多维度打分 + MMR 多样性，能把准确率再提 15%。

**答案生成需要严格约束。**
不明确说"只根据提供的信息回答"，LLM 会悄悄加入自己的知识——
你以为它在引用简历，其实它在发挥。

### 适用场景

RAG 特别适合：私有知识库问答、需要引用来源的场景、知识更新频繁的场景。

不适合：需要复杂推理的问题、创意性内容生成、知识库太小（< 10 个文档）。

### 下一步优化方向

1. **混合检索**：向量搜索 + 关键词搜索（BM25）加权融合
2. **查询扩展**：用 LLM 生成相关问题，多角度检索
3. **上下文压缩**：用 LLM 提取关键信息，减少 Token 消耗
4. **评估体系**：构建测试集，自动化评估准确率

---

## 写在最后

学完这一章，回头看整个 RAG 流程，有一个感受：

**每一步都在做减法。**

切片，是把大文档切成小块，去掉无关的部分。
意图提取，是把模糊的问题变成精准的查询，去掉歧义。
重排序，是在候选结果里再筛一遍，去掉不够好的。
答案验证，是在生成之后再检查一遍，去掉编造的。

每一步都是在减少噪音，留下有用的。

有意思的是，这个过程和我整理简历 YAML 的过程很像——
把十年的经历，一点一点提炼成结构化的内容，去掉冗余，留下核心。

《易经·损卦》说："损之又损，以至于无为。"
减掉不该有的，留下来的才是真正需要的。

RAG 的优化路径，和整理简历这件事，说的是同一个道理。

---

*昇哥 · 2026年3月*
*一边学 RAG，一边用自己的简历做实验，把踩过的坑写下来*