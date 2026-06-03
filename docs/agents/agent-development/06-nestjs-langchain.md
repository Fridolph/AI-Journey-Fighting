# NestJS 集成 LangChain：从脚本到生产服务

## 开篇

前面所有文章里的代码，都是在 Node.js 脚本里跑的。用这种方式做 demo 没问题，但生产环境不可能让用户 `node ask.mjs` 来调用。

这篇文章解决的是**工程化最后一公里**：如何把 LangChain 的 Agent 能力嵌入到一个真正的后端服务里。

我们选择 **NestJS**——它是 Node.js 生态中最成熟的"有架构感"的后端框架，通过依赖注入（DI）、模块化、装饰器，把 AI Agent 的各个组件（Model、Prompt、Tool）变成可管理、可测试、可替换的 Provider。

> 代码来自 `examples/hello-nest-langchain/` 和 `examples/cron-job-tool/`。

---

## 一、两个项目，两次跃迁

我们做了两个项目，代表两次能力跃迁：

| 项目 | 核心能力 | 特点 |
|------|---------|------|
| `hello-nest-langchain` | SSE 流式 AI 接口 | NestJS 基础 + LangChain 集成 + 流式返回 |
| `cron-job-tool` | Agent Loop + 多 Tool + 定时任务 | 6 个 Tool 的 DI 管理 + 定时任务调度 |

先跑通第一个，再做第二个。

---

## 二、hello-nest-langchain：把 LangChain 装进 NestJS

### 项目结构

```
hello-nest-langchain/
├── src/
│   ├── ai/
│   │   ├── ai.module.ts       ← 模块定义 + useFactory 注入 ChatModel
│   │   ├── ai.service.ts      ← 业务逻辑
│   │   └── ai.controller.ts   ← 路由（同步 + SSE 流式）
│   ├── app.module.ts          ← 根模块
│   └── main.ts                ← 入口
└── public/
    └── sse-test.html          ← 前端 SSE 调用示例
```

### 关键一：用 useFactory 注入 ChatModel

NestJS 的依赖注入不是直接 `new`，而是通过 Provider 工厂：

```ts
// ai.module.ts
@Module({
  providers: [
    {
      provide: 'CHAT_MODEL',
      useFactory: (configService: ConfigService) => {
        return new ChatOpenAI({
          model: configService.get('MODEL_NAME'),
          apiKey: configService.get('OPENAI_API_KEY'),
          configuration: {
            baseURL: configService.get('OPENAI_BASE_URL'),
          },
        })
      },
      inject: [ConfigService],
    },
    AiService,
  ],
})
export class AiModule {}
```

然后在 Service 中通过 `@Inject` 获取：

```ts
@Injectable()
export class AiService {
  constructor(
    @Inject('CHAT_MODEL') private readonly model: ChatOpenAI,
  ) {}
}
```

这比在脚本里 `import { model } from './model.mjs'` 要好：环境变量由 ConfigService 统一管理，切换模型只需改 Provider 的 useFactory。

### 关键二：SSE 流式返回

Controller 里暴露两个端点：

```ts
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // 同步接口
  @Get('chat')
  async chat(@Query('query') query: string) {
    return { answer: await this.aiService.runChain(query) }
  }

  // SSE 流式接口
  @Sse('chat/stream')
  chatStream(@Query('query') query: string): Observable<MessageEvent> {
    const stream = this.aiService.runChainStream(query)
    return new Observable((subscriber) => {
      ;(async () => {
        for await (const chunk of stream) {
          subscriber.next({ data: chunk })
        }
        subscriber.complete()
      })()
    })
  }
}
```

代码位置：`examples/hello-nest-langchain/src/ai/ai.controller.ts`

**关键修复**：最初的实现用 `from(stream)` 转 Observable，但 `from` 是同步创建，而 `AsyncIterable` 的处理需要回调式订阅。修复后改用 `new Observable` + `async callback`，确保异步迭代正确完成。

前端用 `EventSource` 消费：

```html
<script>
const eventSource = new EventSource('/ai/chat/stream?query=介绍一下LangChain')

eventSource.onmessage = (event) => {
  document.getElementById('output').textContent += event.data
}
</script>
```

代码位置：`examples/hello-nest-langchain/public/sse-test.html`

---

## 三、cron-job-tool：多 Tool 的 Provider 化管理 + 定时任务

第二个项目把复杂度拉满——6 个 Tool、MySQL 持久化、邮件发送、网络搜索、定时任务调度。

### 项目架构

```
cron-job-tool/
├── src/
│   ├── ai/
│   │   ├── ai.module.ts         ← 导入 ToolModule，注入 QUERY_USER_TOOL
│   │   ├── ai.service.ts        ← Agent Loop（同步 + 流式）
│   │   ├── ai.controller.ts     ← GET /ai/chat + SSE /ai/chat/stream
│   │   ├── user.service.ts      ← 用户查询
│   │   └── job-agent.service.ts ← 定时任务触发的独立 Agent
│   ├── tool/
│   │   ├── tool.module.ts       ← 6 个 Tool Provider 统一管理
│   │   ├── llm.service.ts       ← LLM 模型工厂
│   │   ├── send-mail-tool.service.ts
│   │   ├── web-search-tool.service.ts
│   │   ├── db-users-crud-tool.service.ts
│   │   ├── time-now-tool.service.ts
│   │   └── cron-job-tool.service.ts
│   ├── job/
│   │   ├── job.service.ts       ← SchedulerRegistry 调度
│   │   └── entities/job.entity.ts
│   └── app.module.ts            ← TypeORM + Mailer + Schedule + Config
```

### 关键一：Tool 的 Provider 化

每个 Tool 是一个独立 Provider，通过 `useFactory` 创建，通过 `@Inject` 注入。举个例子——定时任务 Tool：

```ts
// tool/cron-job-tool.service.ts
@Injectable()
export class CronJobToolService {
  readonly tool

  @Inject(JobService)
  private readonly jobService: JobService

  constructor() {
    this.tool = tool(
      async ({ action, type, instruction, cron, everyMs, at }) => {
        switch (action) {
          case 'list': return await this.jobService.listJobs()
          case 'add':  return await this.jobService.addJob({ type, instruction, cron, everyMs, at })
          case 'toggle': return await this.jobService.toggleJob(id, enabled)
        }
      },
      {
        name: 'cron_job',
        description: '管理服务端定时任务（支持 list/add/toggle）',
        schema: z.object({
          action: z.enum(['list', 'add', 'toggle']),
          type: z.enum(['cron', 'every', 'at']).optional(),
          instruction: z.string().optional(),
          // ...
        }),
      }
    )
  }
}

// tool/tool.module.ts
@Module({
  providers: [
    {
      provide: 'CRON_JOB_TOOL',
      useFactory: (svc: CronJobToolService) => svc.tool,
      inject: [CronJobToolService],
    },
  ],
  exports: ['CRON_JOB_TOOL'],
})
```

代码位置：`examples/cron-job-tool/src/tool/cron-job-tool.service.ts`

### 关键二：AiService 注入 6 个 Tool + Agent Loop

```ts
@Injectable()
export class AiService {
  constructor(
    @Inject('CHAT_MODEL') model: ChatOpenAI,
    @Inject('QUERY_USER_TOOL') private queryUserTool,
    @Inject('SEND_MAIL_TOOL') private sendMailTool,
    @Inject('WEB_SEARCH_TOOL') private webSearchTool,
    @Inject('DB_USERS_CRUD_TOOL') private dbUsersCrudTool,
    @Inject('TIME_NOW_TOOL') private timeNowTool,
    @Inject('CRON_JOB_TOOL') private cronJobTool,
  ) {
    this.modelWithTools = model.bindTools([...6 个 tool])
  }
}
```

**Agent Loop** 和处理工具调用的分发：

```ts
async runChain(query: string): Promise<string> {
  const messages = [new SystemMessage(systemPrompt), new HumanMessage(query)]

  while (true) {
    const aiMessage = await this.modelWithTools.invoke(messages)
    messages.push(aiMessage)

    if (!aiMessage.tool_calls?.length) {
      return aiMessage.content  // 没有要调用的工具，结束
    }

    for (const tc of aiMessage.tool_calls) {
      // 按 toolName 分发
      if (tc.name === 'query_user') {
        const result = await this.queryUserTool.invoke(tc.args)
        messages.push(new ToolMessage({ tool_call_id: tc.id, name: tc.name, content: result }))
      } else if (tc.name === 'send_mail') {
        // ...
      }
      // ... 其他 tool
    }
  }
}
```

代码位置：`examples/cron-job-tool/src/ai/ai.service.ts`

### 关键三：流式 Agent Loop

流式版本的关键差异——不直接 `invoke` 而是 `stream`，用 `tool_call_chunks` 判断是否正在调工具：

```ts
async *runChainStream(query: string): AsyncIterable<string> {
  const messages = [/*...*/]

  while (true) {
    const stream = await this.modelWithTools.stream(messages)
    let fullAIMessage = null

    for await (const chunk of stream) {
      fullAIMessage = fullAIMessage ? fullAIMessage.concat(chunk) : chunk

      const isToolCalling = (fullAIMessage.tool_call_chunks?.length ?? 0) > 0
      // 只有在确定不是工具调用时，才 yield 文本给用户
      if (!isToolCalling && chunk.content) {
        yield chunk.content as string
      }
    }

    // 工具调用结束 → 执行工具 → 进入下一轮（不 yield 工具结果给用户）
    const toolCalls = fullAIMessage.tool_calls ?? []
    if (!toolCalls.length) return

    for (const tc of toolCalls) { /* 执行工具 */ }
  }
}
```

### 关键四：定时任务的生命周期

这是本章最精彩的部分——通过 Tool 接口让 AI 创建定时任务，任务到期后自动执行。

```
用户："1分钟后提醒我喝水"
  → LLM 返回 tool_call: cron_job.add({ type: "at", at: "2025-...", instruction: "提醒我喝水" })
  → AiService 执行 cronJobTool.invoke(args)
  → CronJobToolService 调用 JobService.addJob()
  → JobService 计算 delay = at - now，创建 setTimeout
  → 1分钟后 setTimeout 触发
  → JobAgentService 启动独立 Agent Loop
  → 用 instruction 作为 prompt，调用 LLM 完成任务
```

```ts
// job.service.ts — at 类型任务的核心实现
if (job.type === 'at') {
  const delay = Math.max(0, job.at.getTime() - Date.now())

  const ref = setTimeout(async () => {
    // 执行完自动停用
    await this.entityManager.update(Job, job.id, {
      lastRun: new Date(),
      isEnabled: false,
    })

    // 启动独立 Agent 执行 instruction
    const result = await this.jobAgentService.runJob(job.instruction)

    // 清理
    this.schedulerRegistry.deleteTimeout(job.id)
  }, delay)

  this.schedulerRegistry.addTimeout(job.id, ref)
}
```

代码位置：`examples/cron-job-tool/src/job/job.service.ts`

**关键设计**：定时任务执行时另起一个独立的 Agent Loop（`JobAgentService`），而不是复用主对话的上下文。这保证了关注点分离——设置任务的处理逻辑和执行任务的处理逻辑互不干扰。

### 关键五：三种调度类型

| 类型 | 底层 | 使用场景 | 语义 |
|------|------|---------|------|
| `at` | `setTimeout` | 一次性提醒 | 到点执行一次后自动停用 |
| `every` | `setInterval` | 定期循环任务 | 按固定毫秒间隔循环执行 |
| `cron` | `CronJob`（cron 库） | 复杂调度 | 按 Cron 表达式循环执行 |

### 关键六：forwardRef 解决循环依赖

`ToolModule` 依赖 `JobModule`（CronJobTool 调用 JobService），`JobModule` 又依赖 `ToolModule`（JobAgentService 使用 Tool 的 CHAT_MODEL）。通过 `forwardRef` 打破循环：

```ts
// tool/tool.module.ts
@Module({
  imports: [UsersModule, forwardRef(() => JobModule)],  // ← 双向引用
})

// job/job.module.ts
@Module({
  imports: [forwardRef(() => ToolModule)],  // ← 双向引用
})
```

---

## 四、从脚本到服务的完整对比

| 维度 | Node.js 脚本 | NestJS 服务 |
|------|-------------|------------|
| 模型管理 | `new ChatOpenAI({...})` 散落各处 | 统一的 LLM Service + ConfigService |
| Tool 管理 | 内联定义，耦合在业务逻辑里 | 独立 Provider，通过 DI 注入 |
| 配置管理 | `dotenv.config()` + `process.env` | `ConfigModule.forRoot()` + 类型安全 |
| 持久化 | 手动读文件 | TypeORM + MySQL |
| 定时任务 | 手动写 `setTimeout/setInterval` | `@nestjs/schedule` SchedulerRegistry |
| 流式返回 | 需要自己搭 HTTP 服务 | NestJS SSE 装饰器 |

---

## 五、小结

这两个项目串起了从"会调用 LLM"到"可部署的 AI Agent 服务"的完整路径：

```
命令行脚本 → NestJS Module/Controller/Service → SSE 流式接口
     ↓
Tool Provider 化 → Agent Loop（同步 + 流式）→ 多 Tool 协作
     ↓
定时任务调度 → JobAgent（独立 Agent Loop）→ 服务端自动化
```

如果你理解了这种架构，你就理解了如何把任何 LangChain Agent 变成一个可上线、可扩展的后端服务。

---

## 相关代码文件

| 文件 | 说明 |
|------|------|
| `examples/hello-nest-langchain/src/ai/` | NestJS + LangChain SSE 流式接口 |
| `examples/hello-nest-langchain/public/sse-test.html` | 前端 SSE 调用 |
| `examples/cron-job-tool/src/ai/ai.service.ts` | Agent Loop（同步 + 流式）|
| `examples/cron-job-tool/src/ai/ai.controller.ts` | Controller（同步 + SSE） |
| `examples/cron-job-tool/src/tool/tool.module.ts` | 6 个 Tool Provider 管理 |
| `examples/cron-job-tool/src/tool/cron-job-tool.service.ts` | 定时任务 Tool |
| `examples/cron-job-tool/src/job/job.service.ts` | SchedulerRegistry 调度 |
| `examples/cron-job-tool/src/ai/job-agent.service.ts` | 定时任务触发的独立 Agent |
