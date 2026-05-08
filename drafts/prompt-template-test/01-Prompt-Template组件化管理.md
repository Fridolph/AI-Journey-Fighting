# Prompt Template：组件化管理 Prompt

## 学习目标与背景

传统方式写 prompt 就是直接拼字符串，但当 prompt 规模变大后，角色、背景、任务、格式等各部分混在一起，难以维护和复用。

LangChain 提供了一套 **Prompt Template API**，允许我们：
- 将 prompt 拆成可独立管理的模块
- 按需组合、复用
- 动态填充占位符变量
- 管理 few-shot 示例的选取（按长度/语义）

本节不涉及「怎么写 prompt 效果更好」，而是聚焦**如何用 API 管理 prompt**。

## 涉及文件一览

| 文件 | 核心作用 |
|------|---------|
| `prompt-template1.mjs` | PromptTemplate 基础用法 |
| `pipeline-prompt-template.mjs` | PipelinePromptTemplate 拆分+组合（导出 persona/context/pipeline 供复用） |
| `pipeline-prompt-template2.mjs` | 复用 persona/context 模块，构建季度 OKR 回顾 prompt |
| `partial.mjs` | `.partial()` 预填入固定变量 |
| `chat-prompt-template.mjs` | ChatPromptTemplate（二维数组写法） |
| `pipeline-prompt-template3.mjs` | PipelinePromptTemplate + ChatPromptTemplate 结合 |
| `chat-prompt-template2.mjs` | SystemMessagePromptTemplate / HumanMessagePromptTemplate 写法 |
| `messages-placeholder.mjs` | MessagesPlaceholder 插入对话历史 |
| `fewshot-prompt-template.mjs` | FewShotPromptTemplate（硬编码示例） |
| `example-selector1.mjs` | LengthBasedExampleSelector 按长度选示例 |
| `weekly-report-examples-writer-milvus.mjs` | 将周报示例写入 Milvus 向量库 |
| `example-selector2.mjs` | SemanticSimilarityExampleSelector 语义选择示例 |
| `fewshot-chat-prompt-template.mjs` | FewShotChatMessagePromptTemplate（对话形式 few-shot） |

---

## 1. PromptTemplate — 基础模版

**文件：`prompt-template1.mjs`**

核心 API：

```js
// 创建模版（占位符用 {变量名} 标记）
const template = PromptTemplate.fromTemplate(`公司名称：{company_name}...`);

// 填充变量，返回最终 prompt 字符串
const prompt = await template.format({
  company_name: '星航科技',
  team_name: '数据智能平台组',
  // ...
});
```

**关键理解：**
- `fromTemplate()` 自动识别 `{变量名}` 为 `inputVariables`
- `format()` 是异步方法，传入 key-value 对象填充占位符
- 同一模版可以换不同数据生成不同 prompt（文件中 demo 了两组数据）

**运行方式：**
```bash
cd examples/prompt-template-test
node src/prompt-template1.mjs
```

---

## 2. PipelinePromptTemplate — 拆分与组合

**文件：`pipeline-prompt-template.mjs`**

核心思想：将一个大 prompt 拆成独立模块（人设、背景、任务、格式），再通过 `PipelinePromptTemplate` 组合。

```js
// A. 人设模块（被 export 以便复用）
export const personaPrompt = PromptTemplate.fromTemplate(
  `你是一名资深工程团队负责人，写作风格：{tone}...`
);

// B. 背景模块（被 export 以便复用）
export const contextPrompt = PromptTemplate.fromTemplate(
  `公司：{company_name}\n部门：{team_name}...`
);

// C. 任务模块
const taskPrompt = PromptTemplate.fromTemplate(`...{dev_activities}...`);

// D. 格式模块
const formatPrompt = PromptTemplate.fromTemplate(`...{company_values}...`);

// E. 最终组合 Prompt（占位符对应各模块输出）
const finalWeeklyPrompt = PromptTemplate.fromTemplate(
  `{persona_block}\n{context_block}\n{task_block}\n{format_block}...`
);

// 用 PipelinePromptTemplate 串联
const pipelinePrompt = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: 'persona_block', prompt: personaPrompt },
    { name: 'context_block', prompt: contextPrompt },
    { name: 'task_block', prompt: taskPrompt },
    { name: 'format_block', prompt: formatPrompt },
  ],
  finalPrompt: finalWeeklyPrompt
});

// 使用时只需一次 format
const result = await pipelinePrompt.format({...所有变量...});
```

**关键理解：**
- `pipelinePrompts` 中的 `name` 对应 `finalPrompt` 中的 `{占位符}`
- 每个子 prompt 可以有自己的 `inputVariables`，LangChain 会自动从运行时传入的变量中匹配
- **inputVariables 参数会自动识别，无需手动声明** — 文章中特别强调了这点
- 每个子模块被各自 format 后，结果拼接进 `finalPrompt` 的对应位置
- 核心价值：**每一部分都可以单独维护和复用**

---

## 3. Pipeline Prompt 复用

**文件：`pipeline-prompt-template2.mjs`**

演示复用 `pipeline-prompt-template.mjs` 中导出的 `personaPrompt` 和 `contextPrompt`，构建**季度 OKR 回顾邮件**场景。

```js
import { personaPrompt, contextPrompt } from './pipeline-prompt-template.mjs';

// 新建自己的任务/格式模块
const okrReviewTaskPrompt = PromptTemplate.fromTemplate(`...{okr_facts}...`);
const okrReviewFormatPrompt = PromptTemplate.fromTemplate(`...`);

// 复用 person + context，组合新场景
const okrReviewPipeline = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: 'persona_block', prompt: personaPrompt },   // 复用
    { name: 'context_block', prompt: contextPrompt },   // 复用
    { name: 'task_block', prompt: okrReviewTaskPrompt },
    { name: 'format_block', prompt: okrReviewFormatPrompt },
  ],
  finalPrompt: PromptTemplate.fromTemplate(`...`)
});
```

**关键理解：**
- 复用不是复制代码，是直接 `import` 已经 export 的 prompt 对象
- 场景从「周报」切换到「季度 OKR 回顾」，但人设/背景部分完全可复用
- pipelinePrompts 的 name 不需要和原来一致（这里还是叫 `persona_block` 等），只要和 finalPrompt 的占位符对应即可

### Pipeline Prompt 复用的本质

同一个 Pipeline 骨架，换两个子模块就变成另一个场景——**零件化思维**：

```
周报场景（pipeline-prompt-template.mjs）        OKR回顾场景（pipeline-prompt-template2.mjs）
───────────────────────────────────          ───────────────────────────────────
personaPrompt ←── 复用 ────→ personaPrompt
contextPrompt ←── 复用 ────→ contextPrompt
taskPrompt (周报任务)     →  okrReviewTaskPrompt (OKR任务)  ← 替换
formatPrompt (周报格式)   →  okrReviewFormatPrompt (OKR格式) ← 替换
```

**人设和背景是通用零件，任务和格式是场景专用零件。** PipelinePromptTemplate 就是零件组装器。

### PipelinePromptTemplate 数据流向图

当调用 `okrReviewPipeline.format({...一大堆变量...})` 时，背后运作机制：

```
你传入所有变量（一次性全给）
      │
      ▼
┌─────────────────────────────────────────────────────┐
│              PipelinePromptTemplate                  │
│                                                     │
│  ① personaPrompt.format({ tone })                    │
│     → "你是一名...写作风格：专业、真诚..."            │
│                                                     │
│  ② contextPrompt.format({ company_name, team_name,   │
│      manager_name, week_range, team_goal })          │
│     → "公司：星航科技\n部门：AI平台组\n..."           │
│                                                     │
│  ③ okrReviewTaskPrompt.format({ okr_facts,            │
│      manager_name })                                │
│     → "以下是本季度...O1...O2..."                     │
│                                                     │
│  ④ okrReviewFormatPrompt.format({})                  │
│     → "请用 Markdown 写这封邮件..."                   │
│                                                     │
│  ⑤ finalPrompt.format({                             │
│       persona_block: ①的结果,                        │
│       context_block: ②的结果,                        │
│       task_block:    ③的结果,                        │
│       format_block:  ④的结果                         │
│     })                                              │
│     → 最终拼接好的完整 prompt                         │
└─────────────────────────────────────────────────────┘
```

**核心要点：每个子 prompt 只「消费」自己声明过的变量，其他变量自动忽略。** 比如 `personaPrompt` 只需要 `{tone}`，你传入的 `okr_facts` 它根本不管。

### Partial 的本质理解

`partial` 不是修改原 prompt，而是「套一层壳」——把固定变量焊死，生成一个新模板：

```
原 pipelinePrompt 需要填 11 个变量：
  tone, company_name, team_name, manager_name, week_range,
  team_goal, dev_activities, company_values, ...

          ↓ .partial({ company_name, company_values, tone })

新 pipelineWithPartial 只需填 8 个变量：
  team_name, manager_name, week_range, team_goal, dev_activities, ...
  （company_name/tone/company_values 已预填，不用再传）
```

---

## 4. Partial — 预填入固定变量

**文件：`partial.mjs`**

有些变量在整个应用中是固定的（公司名、价值观、语气风格），可以用 `.partial()` 预填入，生成一个新的 PromptTemplate。

```js
import { pipelinePrompt } from './pipeline-prompt-template.mjs';

// 预填入固定值，返回一个新的 PromptTemplate
const pipelineWithPartial = await pipelinePrompt.partial({
  company_name: '星航科技',
  company_values: '「极致、开放、靠谱」的价值观',
  tone: '偏正式但不僵硬',
});

// 之后使用时只需填入剩余动态变量
const result = await pipelineWithPartial.format({
  team_name: 'AI 平台组',
  manager_name: '刘东',
  // ...
});
```

**关键理解：**
- `partial()` 返回的是**新的 PromptTemplate**，不是修改原对象
- 固定变量「消失」了 — 后续 `format()` 时不需要再传
- 文件中 demo 了两组不同的 team_name/manager_name，快速生成两份不同周报
- 实际场景：公司信息、项目名、语言风格等全局配置，可以在系统初始化时 partial 掉

---

## 5. ChatPromptTemplate — 对话形式 Prompt

**文件：`chat-prompt-template.mjs`**

实际开发中，更常用的是 messages 数组（SystemMessage / HumanMessage / AIMessage）而非纯文本 prompt。

```js
// 写法一：二维数组
const chatPrompt = ChatPromptTemplate.fromMessages([
  ['system', `你是一名资深工程团队负责人...{tone}...`],
  ['human', `本周信息如下：{company_name}...{team_goal}...{dev_activities}...`],
]);

// 使用方法
const messages = await chatPrompt.formatMessages({ ...变量... });
const response = await model.invoke(messages);
```

**关键理解：**
- `ChatPromptTemplate.fromMessages()` 接收消息数组
- 每条消息是 `[角色, 内容]` 的格式
- 角色可以是 `system` / `human` / `ai` / `tool` 等
- `formatMessages()` 返回的是 LangChain Message 对象数组（包含 `role`、`content` 等属性）
- 输出可直接喂给 ChatOpenAI 的 `invoke()`

### Prompt Template 与前端框架对比理解

可以把 Prompt Template 类比为 Vue 的模板系统，但有一个关键差异：

```
Vue 组件：    模板 + 数据 → HTML（渲染到 DOM）
PromptTemplate：   模板 + 数据 → 最终 prompt 文本（发给模型）
ChatPromptTemplate：模板 + 数据 → messages 数组（发给模型）
```

ChatPromptTemplate 输出的不是纯文本，而是**结构化的消息对象**：

```js
// formatMessages() 的实际输出：
[
  { role: 'system', content: '你是一名资深工程团队负责人...' },
  { role: 'human',  content: '本周信息如下：公司名称：星航科技...' },
]
```

这就是为什么它能直接喂给 `model.invoke()`——模型需要知道哪条是 system 指令、哪条是 human 提问。类比 Vue，这就像组件不仅有模板，还知道哪些是「指令」、哪些是「数据」。

---

## 6. PipelinePromptTemplate + ChatPromptTemplate

**文件：`pipeline-prompt-template3.mjs`**

PipelinePromptTemplate 的 `finalPrompt` 不仅可以是普通 PromptTemplate，也可以是 ChatPromptTemplate。

```js
// 最终 Promp 是 ChatPromptTemplate
const finalChatPrompt = ChatPromptTemplate.fromMessages([
  ['system', `你是一名资深工程团队负责人...`],
  ['human', `人设与写作风格：{persona_block}
团队与本周背景：{context_block}
任务与输入数据：{task_block}
输出格式要求：{format_block}
现在请基于以上信息，直接输出最终的周报内容。`],
]);

const weeklyChatPipelinePrompt = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: 'persona_block', prompt: personaPrompt },
    { name: 'context_block', prompt: contextPrompt },
    { name: 'task_block', prompt: weeklyTaskPrompt },
    { name: 'format_block', prompt: weeklyFormatPrompt },
  ],
  finalPrompt: finalChatPrompt  // 注意：这里是 ChatPromptTemplate！
});

// 关键：用 formatPromptValue 生成消息
const promptValue = await weeklyChatPipelinePrompt.formatPromptValue({...});
console.log(promptValue.toChatMessages());  // 获取消息数组
```

**关键理解：**
- 当 finalPrompt 是 ChatPromptTemplate 时，需用 `formatPromptValue()` 而非 `format()`
- `formatPromptValue()` 返回一个 `ChatPromptValue` 对象，可通过 `.toChatMessages()` 获取消息数组
- 这种组合方式是实际开发中最常用的模式
- 父模块的各个子 prompt 依然返回纯文本，但最终被塞进 ChatPromptTemplate 的 human message 中

### PipelinePromptTemplate3 的「两层拼接」机制

`pipeline-prompt-template3.mjs` 与 `pipeline-prompt-template.mjs` 的核心差异在于 **finalPrompt 的类型不同**：

```
pipeline-prompt-template.mjs:
  finalPrompt 是 PromptTemplate → 输出纯文本

pipeline-prompt-template3.mjs:
  finalPrompt 是 ChatPromptTemplate → 输出 messages 数组
```

两层拼接流程：

```
                    各子模块 format 拼接
PipelinePromptTemplate ──────────────────→ 中间文本（persona_block, context_block...）
                                                      │
                                                      ▼
                          ChatPromptTemplate.fromMessages([
                            ['system', '...'],
                            ['human', '{persona_block}\n{context_block}\n...'],
                          ]).formatPromptValue(...)
                                                      │
                                                      ▼
                                              messages 数组（发给模型）
```

代码中的关键转换点在 `formatPromptValue()` + `toChatMessages()`：

```js
const promptValue = await weeklyChatPipelinePrompt.formatPromptValue({...});
//        ↑ ChatPromptValue 对象
const messages = promptValue.toChatMessages();
//        ↑ 消息数组，可以喂给 model
```

---

## 7. ChatPromptTemplate 另一种写法

**文件：`chat-prompt-template2.mjs`**

用 `SystemMessagePromptTemplate` / `HumanMessagePromptTemplate` 等独立创建每个 message 模板，然后传入 `fromMessages()`。

```js
const systemTemplate = SystemMessagePromptTemplate.fromTemplate(
  `你是一名资深工程团队负责人...{tone}...`
);

const humanTemplate = HumanMessagePromptTemplate.fromTemplate(
  `本周信息如下：{company_name}...`
);

// 传入的是对象数组，不是二维数组
const composedTemplate = ChatPromptTemplate.fromMessages([
  systemTemplate,
  humanTemplate,
]);

// 使用方式一样
const messages = await composedTemplate.formatMessages({...});
```

**关键理解：**
- 两种写法等价，结果相同
- 对象写法更清晰：每个 message 模板是独立对象，可以分别 export/import 复用
- 对应的还有 `AIMessagePromptTemplate`、`ToolMessagePromptTemplate` 等
- 在 PipelinePromptTemplate 场景中，二维数组写法更常见（子 prompt 的输出已经是字符串）

---

## 8. MessagesPlaceholder — 插入对话历史

**文件：`messages-placeholder.mjs`**

`inputVariables` 只能填充字符串值。如果要在 messages 中间插入一段**多轮对话历史**（多条消息），就需要 `MessagesPlaceholder`。

```js
const chatPromptWithHistory = ChatPromptTemplate.fromMessages([
  ['system', `你是一名资深工程效率顾问...`],
  new MessagesPlaceholder('history'),     // 插入点
  ['human', `这是用户本轮的新问题：{current_input}...`],
]);

// 传入历史消息
const historyMessages = [
  { role: 'human', content: '我们团队最近在做...' },
  { role: 'ai', content: '听起来不错...' },
  { role: 'human', content: '我们已经把 Prompt 拆成了...' },
  { role: 'ai', content: '很好，接下来可以考虑...' },
];

const formattedMessages = await chatPromptWithHistory.formatPromptValue({
  history: historyMessages,
  current_input: '现在我们想再优化一下多人协同编辑周报的流程...',
});
```

**关键理解：**
- `MessagesPlaceholder` 的变量名（如 `'history'`）是一个「消息列表」占位符，不是字符串占位符
- 运行时传入的是消息对象数组（含 role + content）
- `formatPromptValue()` + `toChatMessages()` 可以验证最终生成的消息结构
- 这个 API 在需要保持多轮对话上下文时**非常常用**

---

## 9. FewShotPromptTemplate — 带示例的 Prompt

**文件：`fewshot-prompt-template.mjs`**

有时候需要给模型提供几个示例（few-shot），让它学习特定的输出风格。用硬编码示例直接展示效果。

```js
// 定义单条示例的模板
const examplePrompt = PromptTemplate.fromTemplate(
  `用户输入：{user_requirement}
期望周报结构：{expected_style}
模型示例输出片段：
{report_snippet}
---`
);

// 准备示例数据
const examples = [
  { user_requirement: '...', expected_style: '...', report_snippet: '...' },
  { user_requirement: '...', expected_style: '...', report_snippet: '...' },
];

// 组合
const fewShotPrompt = new FewShotPromptTemplate({
  examples,
  examplePrompt,
  prefix: `下面是几条已经写好的【周报示例】...\n`,
  suffix: `\n基于上面的示例风格，请帮我写一份新的周报。...`,
  inputVariables: [],  // 示例本身不依赖运行时变量
});

const result = await fewShotPrompt.format({});  // 不需要传参
```

**关键理解：**
- `examplePrompt` 定义每条示例的格式（占位符对应 examples 中的 key）
- `examples` 是数组，每条是 `examplePrompt` 各占位符的 key-value
- `prefix` 放在所有示例前面，`suffix` 放在后面
- 最终输出 = `prefix` + 所有 format 后的示例 + `suffix`
- 硬编码示例适合数量固定、少的场景

---

## 10. LengthBasedExampleSelector — 按长度选示例

**文件：`example-selector1.mjs`**

当示例很多，不能全塞进去（token 限制），需要**自动选择**合适的示例。

```js
import { LengthBasedExampleSelector } from '@langchain/core/example_selectors';

// 创建 selector
const exampleSelector = await LengthBasedExampleSelector.fromExamples(examples, {
  examplePrompt,
  maxLength: 700,                        // 示例总长度上限
  getTextLength: (text) => text.length,  // 长度计算函数（默认字符数，可改为 token 计数）
});

// 用 selector 构建 FewShotPromptTemplate
const fewShotPrompt = new FewShotPromptTemplate({
  examplePrompt,
  exampleSelector,  // 传入 selector 而非 examples
  prefix: '...',
  suffix: '...',
  inputVariables: ['current_requirement'],
});

const result = await fewShotPrompt.format({ current_requirement: '...' });
```

**关键理解：**
- `maxLength` 减去 prefix/suffix 及 format 参数的字符数，剩下的空间给示例
- 示例按顺序尝试放入，超过剩余长度就停止
- `getTextLength` 默认是字符长度 `text.length`，可改为 token 估算（传入自定义函数）
- 不同 query 可能选出不同数量和组合的示例
- 文件中有意构造了长短不一的示例：超短的（1行）、短的（3行）、超长的（6行+），方便观察 selector 行为

---

## 11. SemanticSimilarityExampleSelector — 语义选择示例

**前置步骤：文件 `weekly-report-examples-writer-milvus.mjs`**

先将 8 条不同类型的周报示例（技术债清理、新功能首发、版本发布、体验优化等）存入 Milvus 向量数据库：

```js
const EXAMPLES = [
  { scenario: '支付系统稳定性治理...', report_snippet: '...' },
  { scenario: '新功能首发...', report_snippet: '...' },
  // ...共 8 条
];

// 对每条示例做 embedding（scenario + report_snippet 拼接后向量化）
const vector = await getEmbedding(example.scenario + example.report_snippet);

// 写入 Milvus
await client.insert({ collection_name, data: [{ id, scenario, report_snippet, vector }] });
```

**使用：文件 `example-selector2.mjs`**

```js
import { SemanticSimilarityExampleSelector } from '@langchain/core/example_selectors';
import { Milvus } from '@langchain/community/vectorstores/milvus';

// 连接已有 Milvus 集合
const vectorStore = await Milvus.fromExistingCollection(embeddings, {
  collectionName: 'weekly_report_examples',
  clientConfig: { address: 'localhost:19530' },
});

// 创建语义选择器
const exampleSelector = new SemanticSimilarityExampleSelector({
  vectorStore,
  k: 2,   // 每次选语义最相近的 2 条
});

// 构建 few-shot prompt
const fewShotPrompt = new FewShotPromptTemplate({
  examplePrompt,
  exampleSelector,
  prefix: '...',
  suffix: '...',
  inputVariables: ['current_scenario'],
});

// 不同场景自动选不同示例
const result1 = await fewShotPrompt.format({
  current_scenario: '技术债清理为主...'     // → 自动选语义接近的示例
});
const result2 = await fewShotPrompt.format({
  current_scenario: '新功能首发 + 对外宣传...' // → 自动选另一批示例
});
```

**关键理解：**
- 基于向量语义相似度匹配，不是字面匹配
- `k: 2` 表示每次选最相似的 2 条
- 示例存储在 Milvus 中，可以动态增删，不必改代码
- 生产环境 vs 开发环境的区别：语义选择依赖 embedding 模型质量和向量库数据
- 运行前需要先确保 Milvus 服务已启动，且已执行 `weekly-report-examples-writer-milvus.mjs` 写入数据

---

## 12. FewShotChatMessagePromptTemplate — 对话形式 Few-Shot

**文件：`fewshot-chat-prompt-template.mjs`**

FewShotPromptTemplate 的对话版本——示例是人类和 AI 之间的一问一答，而不是纯文本片段。

```js
const EXAMPLES = [
  {
    input: '本周主要推进支付稳定性治理...',
    output: '- 本周围绕支付链路稳定性开展治理工作...',
  },
  // ...
];

const fewShotExamples = new FewShotChatMessagePromptTemplate({
  examplePrompt: ChatPromptTemplate.fromMessages([
    ['human', '下面是本周的工作概述：\n{input}\n\n请帮我整理成适合发在团队周报里的要点列表。'],
    ['ai', '{output}'],
  ]),
  examples: EXAMPLES,
  inputVariables: [],  // 示例不依赖运行时变量
});

// 直接嵌入 ChatPromptTemplate
const chatPrompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一名资深技术负责人...'],
  ['system', '下面是若干参考示例...'],
  fewShotExamples,                        // 直接作为 messages 的一部分
  ['human', '这是我本周的实际工作内容：\n{current_work}'],
]);

const messages = await chatPrompt.formatMessages({ current_work: '...' });
const stream = await model.stream(messages);
```

**关键理解：**
- 示例是 human-ai 对话对，而非纯文本
- `examplePrompt` 是 `ChatPromptTemplate`（messages 格式），不是普通的 `PromptTemplate`
- 可以直接将 `fewShotExamples` 对象塞进 `ChatPromptTemplate.fromMessages()` 的数组中
- 每种示例类型对应不同的场景（如治理类 vs 交付类）
- 相比 `FewShotPromptTemplate`，这个更贴近实际对话调用的格式

---

## API 总结

| API | 用途 | 关键方法 |
|-----|------|---------|
| `PromptTemplate` | 基础模版，含占位符 | `fromTemplate()`, `format()`, `partial()` |
| `ChatPromptTemplate` | 对话形式模版 | `fromMessages()`, `formatMessages()`, `formatPromptValue()` |
| `PipelinePromptTemplate` | 合并多个 PromptTemplate | `new PipelinePromptTemplate({ pipelinePrompts, finalPrompt })` |
| `SystemMessagePromptTemplate` | 系统消息模版 | `fromTemplate()` |
| `HumanMessagePromptTemplate` | 用户消息模版 | `fromTemplate()` |
| `MessagesPlaceholder` | 插入消息列表（如对话历史） | `new MessagesPlaceholder('变量名')` |
| `FewShotPromptTemplate` | 带示例的提示词模版 | `new FewShotPromptTemplate({ examples/exampleSelector, examplePrompt, prefix, suffix })` |
| `FewShotChatMessagePromptTemplate` | 对话形式的 few-shot | 同上，但 examplePrompt 是 ChatPromptTemplate |
| `LengthBasedExampleSelector` | 按字符/token 长度选示例 | `fromExamples(examples, { maxLength, getTextLength })` |
| `SemanticSimilarityExampleSelector` | 按语义相似度选示例 | `new SemanticSimilarityExampleSelector({ vectorStore, k })` |
| `PipelinePromptTemplate` + `ChatPromptTemplate` | 模块化 + 对话形式 | finalPrompt 用 ChatPromptTemplate，调用 `formatPromptValue()` |

---

## 兼容性踩坑：DeepSeek 不支持 Embeddings

**现象：** 运行 `example-selector2.mjs` 报 `MODEL_NOT_FOUND` 404 错误。

**原因：** 项目 `OPENAI_BASE_URL` 指向 `https://api.deepseek.com`，但 **DeepSeek 官方 API 目前不提供 embeddings 端点**。而 `SemanticSimilarityExampleSelector` 需要调用 embedding 模型做向量化。

**解决：** Chat 模型和 Embedding 模型分离配置：

| 配置项 | 用途 | 值 |
|--------|------|----|
| `OPENAI_BASE_URL` | Chat 模型 | `https://api.deepseek.com` |
| `EMBEDDINGS_URL` | Embedding 模型 | `https://dashscope.aliyuncs.com/compatible-mode/v1`（千问） |
| `EMBEDDINGS_API_KEY` | Embedding API Key | 千问的 key |

修复版文件：
- `weekly-report-examples-writer-milvus-fix.mjs` — 写入 Milvus 时用千问 embedding
- `example-selector2-fix.mjs` — 语义选择时用千问 embedding

运行方式：
```bash
# 先写入示例数据到 Milvus（需 Milvus 已启动）
node src/weekly-report-examples-writer-milvus-fix.mjs

# 再跑语义选择
node src/example-selector2-fix.mjs
```

**注意：** embedding 模型一旦更换，Milvus 中的向量维度/语义空间就不匹配了，需要**全量删除并重建向量库**。

---

## 兼容性踩坑：原生 SDK 写入 vs LangChain 读取出 schema 不兼容

**现象：** `example-selector2-fix.mjs` 检索结果中 `doc.pageContent` 为空，FewShot 拿不到 `report_snippet` 内容。导致 AI 自己编造数据（如「4 个子模块、30 条单测」），而非参考 Milvus 中已存入的真实示例。

**原因：**

| 层面 | 写入方式 | 使用的字段 | 读取方式 | 期望字段 |
|------|---------|-----------|---------|---------|
| 原版 | 原生 Milvus SDK `client.insert()` | 自定义 `scenario` / `report_snippet` / `vector` | LangChain `similaritySearch()` | `langchain_text`（textField） |

原版 `weekly-report-examples-writer-milvus.mjs` 用原生 SDK 自定义 schema 写数据，文本存在 `report_snippet` 字段。但 LangChain 的 `Milvus.fromExistingCollection()` 读取时，默认 `textField: 'langchain_text'`，读不到自定义字段的内容。

**解决：** 用 LangChain 的 `Milvus.fromDocuments()` 写入，让 schema 与 LangChain 读取层保持一致：

```
写入：pageContent → embedding（vector 字段）+ langchain_text（原文）
      metadata  → JSON 序列化到 metadata 字段
读取：doc.pageContent = 原文
      doc.metadata.scenario / doc.metadata.report_snippet = 自定义数据
```

修复版文件：
- `weekly-report-examples-writer-milvus-fix-v2.mjs` — 用 LangChain `fromDocuments()` 建集合并写入
- `example-selector2-check.mjs` — 验证检索结果脚本，可查看 Milvus 全量数据 + 语义检索 TOP 结果

**验证结果（修复后）：**
```
场景：技术债清理
检索 TOP 2：
  第 1 名 → weekly_5（技术债清理为主）✓ report_snippet 正常
  第 2 名 → weekly_6（老系统拆分）    ✓ report_snippet 正常
匹配准确，示例内容完整可读
```

**关键教训：** 当写入端和读取端分别使用不同封装层（原生 SDK vs LangChain）时，需要确保字段名和 schema 约定一致。最简单的方式是**全程用同一层封装读写**。

---

## 开发注意事项

1. **`inputVariables` 自动识别**：大多数情况下不需要手动声明，LangChain 会自动从模版字符串中提取 `{占位符}`。
2. **`partial()` 不修改原对象**：返回的是新 PromptTemplate，原对象不变。
3. **PipelinePromptTemplate 的 finalPrompt 类型决定调用方式**：普通 PromptTemplate 用 `format()`；ChatPromptTemplate 用 `formatPromptValue()`。
4. **MessagesPlaceholder 传入的是消息数组**，不是字符串。
5. **SemanticSimilarityExampleSelector 需要向量库支持**：Milvus 必须已启动且已写入示例数据。
6. **文件间的导出/导入关系**：`personaPrompt`、`contextPrompt`、`pipelinePrompt` 在 `pipeline-prompt-template.mjs` 中 export，被 `pipeline-prompt-template2.mjs`、`pipeline-prompt-template3.mjs`、`partial.mjs` 引用。

---

## 场景速查：什么场景用什么 API

不用死记，用时回来查这张表即可：

| 场景 | 用什么 API | 一句话 |
|------|-----------|--------|
| 简单 prompt，几个变量填充 | `PromptTemplate` | `fromTemplate('{name}') + format({name})` |
| 需要 system/human/ai 角色分离 | `ChatPromptTemplate` | `fromMessages([['system','...'],['human','...']])` |
| prompt 很大，想拆成「人设/背景/任务/格式」等模块 | `PipelinePromptTemplate` | 先拆零件，再拼装，零件可跨文件复用 |
| 某些变量全局固定（公司名、语气） | `.partial()` | 焊死固定变量，减少后续参数 |
| 需要插入多轮对话历史 | `MessagesPlaceholder` | 占位符不是字符串，是消息数组 |
| 给 AI 看几个范例再提问 | `FewShotPromptTemplate` | examples + examplePrompt + prefix/suffix |
| 范例是 human-ai 对话格式 | `FewShotChatMessagePromptTemplate` | 同上，但 examplePrompt 是 ChatPromptTemplate |
| 范例太多，按 token 限制筛 | `LengthBasedExampleSelector` | 按数组顺序塞，塞到 maxLength 为止 |
| 范例太多，要选和当前场景相关的 | `SemanticSimilarityExampleSelector` | 向量语义匹配 + Milvus 存示例 |

## 调用方式速查

| finalPrompt 类型 | 调用方法 | 返回值 |
|-----------------|---------|--------|
| `PromptTemplate` | `pipeline.format({...})` | 纯文本字符串 |
| `ChatPromptTemplate` | `pipeline.formatPromptValue({...})` | ChatPromptValue → `.toChatMessages()` 得消息数组 |

## 文件依赖关系图

```
pipeline-prompt-template.mjs （核心文件，export 公用零件）
  ├── personaPrompt ─────────────→ pipeline-prompt-template2.mjs
  ├── contextPrompt ─────────────→ pipeline-prompt-template2.mjs
  ├── personaPrompt + contextPrompt → pipeline-prompt-template3.mjs
  └── pipelinePrompt ────────────→ partial.mjs

example-selector2-fix.mjs ←── 依赖 Milvus + 千问 embedding
  ↑
weekly-report-examples-writer-milvus-fix-v2.mjs （先跑写入，再跑选择）
```

## 本章学习感悟

- 不需要记住所有 API，重点区分 **「什么场景用什么」**，用到时回来查上表
- `PipelinePromptTemplate` + `ChatPromptTemplate` 是生产环境最常用的组合
- `MessagesPlaceholder` 是建设 Agent 记忆/历史能力的关键入口
- `ExampleSelector` 解决 few-shot 动态选例，LengthBased 和 Semantic 各有适用场景
- 两个踩坑牢记：① DeepSeek 不支持 embedding → Chat/Embedding 服务要分离配置 ② 写入/读出用不同封装层 → schema 不兼容

## 下一步方向

贴回博客原文的后续章节，按学习节奏进入下一个主题。
