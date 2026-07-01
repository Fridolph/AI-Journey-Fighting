---
title: 【AI全栈】01 Prompt Template 周报生成——用 NestJS + LangChain 搭建第一个 AI Demo
published: 2026-05-01
tags: [AI, NestJS, LangChain, Prompt, SSE, 全栈]
category: AI全栈
---

> 从零搭建一个 AI Demo 工程化平台，第一个接入的 Demo —— 角色驱动的智能报告生成器。
> 这篇文章会带你走完：AI Prompt 模板设计 → NestJS 后端封装 → SSE 流式输出 → 前端交互，完整全栈闭环。

---

## 一、这个 Demo 做什么

用户选择角色（部门 Leader / 技术研发 / 老板）、报告类型（日报 / 周报 / 月报等），填入工作数据，AI 按角色视角生成一份 Markdown 格式的专业报告。

核心卖点：

- **角色注入**：不同角色看到不同的视角和语气——Leader 关注交付，技术关注实现，老板关注 ROI
- **Prompt Template**：用 LangChain 的 `PromptTemplate` 做变量填充，不是拼字符串
- **Few-Shot**：用户可粘贴参考报告，AI 模仿其风格和结构
- **双模式运行**：普通请求返回完整文本，流式请求（SSE）逐 token 输出
- **工程化封装**：NestJS Module → Service → Zod 校验 → AI Provider 抽象，三层解耦

---

## 二、后端架构：NestJS 三层解耦

整个 Demo 在 NestJS 中的分层：

```
DemosController (路由分发)
  └── DemosService (Runner 调度)
        └── PromptTemplateWeeklyReportService (业务逻辑)
              ├── promptTemplateWeeklyReportInputSchema (Zod 校验)
              ├── REPORT_PROMPT (Prompt 模板)
              ├── ROLE_PERSPECTIVE (角色视角)
              ├── REPORT_TYPE_GUIDE (报告结构指引)
              └── AiService (AI 模型调用)
```

### 2.1 路由层：DemosController

```typescript
@Public()
@Controller('demos')
export class DemosController {
  @Post(':id/run')
  async runDemo(@Param('id') id: string, @Body() body: unknown) {
    return await this.demosService.runDemo(id, body)
  }

  @Post(':id/stream')
  @SkipApiResponse()
  async streamDemo(@Param('id') id: string, @Body() body: unknown, @Res() res: Response) {
    prepareSseResponse(res)
    writeSseEvent(res, { event: 'meta', data: { demoId: id, status: 'started' } })

    for await (const text of this.demosService.streamDemo(id, body)) {
      writeSseEvent(res, { event: 'token', data: { text } })
    }

    writeSseEvent(res, { event: 'done', data: { status: 'success' } })
  }
}
```

路由用 `:id` 动态分发——好处是后续接入新 Demo，Controller 这层完全不用动。

### 2.2 输入校验：Zod Schema

```typescript
import { z } from 'zod'

export const REPORT_ROLES = ['部门Leader', '技术研发', '老板'] as const
export const REPORT_TYPES = ['日报', '周报', '月报', '季度总结', '半年总结', '年度总结'] as const

export const promptTemplateWeeklyReportInputSchema = z.object({
  role: z.enum(REPORT_ROLES),
  reportType: z.enum(REPORT_TYPES),
  dateRange: z.string().min(1, '汇报时间不能为空'),
  companyName: z.string().optional().default(''),
  teamName: z.string().optional().default(''),
  managerName: z.string().optional().default(''),
  teamGoal: z.string().optional().default(''),
  devActivities: z.string().min(15, '主要内容至少 15 个字'),
  reportTemplate: z.string().optional().default(''),
  customPrompt: z.string().optional().default(''),
})
```

`z.enum()` 限制角色和报告类型，非法值在进入 Service 之前就被拦截——不让脏数据走进 AI 调用链。

---

## 三、AI 核心：Prompt Template 设计

这是整个 Demo 最值得停一下的部分。

不是简单拼字符串，而是用 LangChain 的 `PromptTemplate` 实现**变量填充 + 条件渲染**。两者的差别，等到 Prompt 复杂起来之后会很明显——拼字符串很快就会变成一团乱麻。

### 3.1 Prompt 模板

```typescript
export const REPORT_PROMPT = `
你是一名{role}，需要根据以下数据生成一份专业的 Markdown 文档。

【角色视角】{rolePerspective}

报告类型：{reportType}
{authorName}
{companyName}{teamName}{managerName}时间范围：{dateRange}

{teamGoal}

活动数据：
{devActivities}
{fewShotExample}
请生成一份格式规范的【{reportType}】，要求：
- 开头有简短的整体 summary（两三句话）
- {reportTypeGuide}
- 语气和视角贴合 {role} 的身份定位
- 适合作为给老板和团队传阅的专业文档
`
```

模板里的 `{}` 变量在运行时被替换为实际值：`{role}`、`{rolePerspective}`、`{reportTypeGuide}` ……每个变量背后都有独立的数据源，不是硬编码在 Prompt 里的。

### 3.2 角色视角注入

```typescript
export const ROLE_PERSPECTIVE: Record<string, string> = {
  部门Leader: '关注团队整体交付、风险管控和资源协调，语气专业稳重',
  技术研发: '关注技术实现细节、性能优化和技术债，语气务实具体',
  老板: '关注业务价值、ROI 和战略方向，语气简洁高度概括',
}
```

用户选"老板"，AI 就自动调整语气，聚焦业务价值和 ROI，不会跑去讲技术细节。这个映射表单独维护，加新角色只改这里。

### 3.3 报告结构指引

```typescript
export const REPORT_TYPE_GUIDE: Record<string, string> = {
  日报: '按【今日完成 / 明日计划 / 风险与阻塞】三部分组织',
  周报: '有按模块/项目拆分的小结，用 Markdown 表格列出关键指标',
  月报: '突出月度关键指标变化趋势，有下月重点规划',
  季度总结: '按维度（业务/技术/团队）拆分复盘',
  // ...
}
```

每种报告类型有自己的结构要求——周报要表格，日报要三段式，季度总结按维度复盘。把这些指引从 Prompt 里抽出来单独维护，Prompt 模板本身就不会随着报告类型增加而膨胀。

### 3.4 Service 核心逻辑

```typescript
@Injectable()
export class PromptTemplateWeeklyReportService implements DemoRunner {
  readonly demoId = 'prompt-template-weekly-report'

  async run(body: unknown): Promise<string> {
    const request = this.parseRunRequest(body)                           // ① Zod 校验
    const model = this.aiService.createStableModel({ temperature: 0.3 }) // ② 创建模型
    const prompt = await this.formatPrompt(request)                      // ③ 填充模板
    const response = await model.invoke(prompt)                          // ④ 调用 AI
    return stringifyAiContent(response.content)
  }

  private async formatPrompt(request: PromptTemplateWeeklyReportInput): Promise<string> {
    const templateSource = request.customPrompt || REPORT_PROMPT
    const promptTemplate = PromptTemplate.fromTemplate(templateSource)

    const fewShotExample = request.reportTemplate
      ? `\n参考示例（请参照此风格和结构）：\n${request.reportTemplate}\n`
      : ''

    return promptTemplate.format({
      ...request,
      reportTypeGuide: REPORT_TYPE_GUIDE[request.reportType] ?? '结构清晰，重点突出',
      rolePerspective: ROLE_PERSPECTIVE[request.role] ?? '',
      fewShotExample,
    })
  }
}
```

数据流走一遍：**用户输入 → Zod 校验 → 查角色视角 → 查报告结构 → 填充 Prompt 模板 → `model.invoke(prompt)` → 返回 Markdown**。每一步职责清晰，哪步出问题一眼能定位。

---

## 四、SSE 流式输出：让 AI "打字"给你看

普通请求（`POST /run`）是等 AI 全部生成完再返回，用户要干等好几秒。
流式请求（`POST /stream`）每生成一个 token 就推送给前端，体验像"打字"。

两种模式都需要，不是非此即彼——简单场景用普通请求，交互体验要求高的用流式。

### 4.1 后端 SSE 实现

```typescript
async *stream(body: unknown): AsyncGenerator<string> {
  const request = this.parseRunRequest(body)
  const model = this.aiService.createStreamingModel({ temperature: 0.3 })
  const prompt = await this.formatPrompt(request)
  const stream = await model.stream(prompt)  // ← LangChain stream

  for await (const chunk of stream) {
    const text = stringifyAiContent(chunk.content)
    if (text.length > 0) yield text          // ← 逐 token 产出
  }
}
```

`model.stream(prompt)` 返回一个 AsyncIterable，每次 `yield` 一个 token。Controller 层拿到这个 Generator，通过 SSE 协议推给前端：

```
event: meta
data: {"demoId":"prompt-template-weekly-report","status":"started"}

event: token
data: {"text":"这"}

event: token
data: {"text":"是"}

event: token
data: {"text":"一份"}

event: done
data: {"status":"success"}
```

### 4.2 前端 SSE 消费

```typescript
const response = await fetch(`${apiBase}/demos/${id}/stream`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: { ...form } }),
})

const reader = response.body.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { value, done } = await reader.read()
  if (done) break

  buffer += decoder.decode(value, { stream: true })
  // 解析 SSE frame → 增量更新 UI
}
```

前端用 `ReadableStream` 逐帧读取，每收到 `event: token` 就追加到展示区，"打字机"效果就是这么来的。

---

## 五、AI Provider 抽象层

所有 Demo 不直接拼 provider 配置，统一通过 `AiService` 创建模型：

```typescript
// AiService 提供 4 个档位
this.aiService.createStableModel({ temperature: 0.3 })    // 稳定任务：周报、结构化输出
this.aiService.createStreamingModel({ temperature: 0.3 })  // 流式任务
this.aiService.createDefaultModel()                        // 普通生成
this.aiService.createCreativeModel()                       // 创意任务
```

底层通过 provider 注册表自动选择模型。切换 provider 只需改 `.env` 中的 `AI_PROVIDER`：

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxx
# baseUrl 和 modelName 由注册表内置，无需手动配置
```

这一层抽象的价值，在第一个 Demo 里感受不明显。等后面 Demo 多了，provider 要切换、要 A/B 测试的时候，就会庆幸当初把这层做出来了。

---

## 六、Demo 注册机制

每个 Demo 通过在 `demo-registry` 中声明元信息接入平台：

```typescript
export const promptTemplateWeeklyReportDemo: DemoMeta = {
  id: 'prompt-template-weekly-report',
  title: '角色驱动 · 智能报告',
  category: 'AI & Agent',
  displayMode: 'custom-page',
  supportsStreaming: true,
  inputFields: [
    { name: 'role', label: '角色', component: 'select', ... },
    { name: 'devActivities', label: '本周开发数据', component: 'textarea', ... },
  ],
  sourceUrl: 'https://github.com/Fridolph/AI-Journey-Fighting/.../prompt-template1.mjs',
}
```

后端通过 `DemosService` 的 Runner Map 调度，前端通过 `useDemoRunner` 加载元信息和交互：

```
registry 元信息 → GET /api/demos → 前端橱窗卡片
                         ↓ 点击
                  /demos/prompt-template-weekly-report
                         ↓
              POST /api/demos/:id/run    (普通)
              POST /api/demos/:id/stream  (流式)
```

新 Demo 接入，只需往 registry 加一条记录——路由、调度、前端展示，都不用改。

---

## 七、完整请求链路（一次 POST /run）

```
前端 [id].vue
  └─ useDemoRunner.runDemo()
       └─ POST /api/demos/prompt-template-weekly-report/run
            └─ DemosController.runDemo()
                 └─ DemosService.runDemo()
                      └─ PromptTemplateWeeklyReportService.run()
                           ├─ 1. promptTemplateWeeklyReportInputSchema.parse(body)
                           ├─ 2. AiService.createStableModel({ temperature: 0.3 })
                           ├─ 3. PromptTemplate.fromTemplate(REPORT_PROMPT).format(vars)
                           ├─ 4. model.invoke(prompt)
                           └─ 5. return stringifyAiContent(content)
            └─ ResponseInterceptor → { code: 200, data: { output: "# ..." } }
  └─ output.value = response.data.output
  └─ DemoOutputPanel 渲染 Markdown
```

---

## 八、关键设计决策

| 决策 | 为什么 |
|---|---|
| 角色视角独立文件 `perspectives.ts` | 不硬编码在 Prompt 中，添加新角色只改配置文件 |
| 报告结构指引 `guides.ts` | 每种报告类型的结构要求独立维护，Prompt 模板保持简洁 |
| `customPrompt` 可覆盖默认模板 | 高级用户可完全自定义 Prompt，不锁死模板 |
| `reportTemplate` 做 Few-Shot | 用户粘贴参考报告即为示例，不依赖外部数据 |
| `temperature: 0.3` | 报告生成需要稳定输出，创意度不宜过高 |
| 两层 Zod 校验 | 泛用 `demoRunRequestSchema` + 专属 `promptTemplateWeeklyReportInputSchema`，兼顾通用和特化 |

---

## 九、核心概念总结

| 概念 | 在本 Demo 中的落地 |
|---|---|
| **Prompt Template** | LangChain `PromptTemplate.fromTemplate()` + `{}` 变量填充 |
| **Role Injection** | `ROLE_PERSPECTIVE` 映射 → 注入角色视角到 System Prompt |
| **Few-Shot** | `reportTemplate` 字段 → 用户粘贴参考报告作为示例 |
| **Streaming (SSE)** | `model.stream()` → AsyncGenerator → `event: token` 逐 token 推送 |
| **Zod Validation** | `z.enum()` 限定角色/报告类型，`z.min(15)` 保证主要内容长度 |
| **Provider Abstraction** | `AiService.createStableModel()` / `createStreamingModel()` 统一创建 |

---

## 写在最后

Prompt Template 周报生成是 AI-Journey-Land 平台接入的第一个 Demo。

别看功能"只是一个输入框生成周报"，背后踩通的是完整的全栈闭环：

**前端 Nuxt 4 交互 → NestJS API 路由 → Zod 输入校验 → LangChain PromptTemplate → AI Provider 抽象层 → 模型调用 → 结果返回 → Markdown 渲染**。

这条链路，是后续所有 Demo（多轮对话、RAG、Agent）的**地基**。后面接入的新 Demo，只是在这个骨架上换"业务逻辑"——路由、校验、模型调用、SSE 输出管道，全部复用。

地基打稳了，后面才能往上盖。

项目地址：[AI-Journey-Land](https://github.com/Fridolph/AI-Journey-Land)，欢迎 star ⭐

---

*昇哥 · 2026年5月*
*学 AI-Journey-Land 项目途中，顺手把想清楚的事写下来。*