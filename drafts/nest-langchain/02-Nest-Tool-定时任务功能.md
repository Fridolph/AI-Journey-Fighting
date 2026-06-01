# Nest + Tool 实现定时任务功能

## 学习目标

在 Nest 后端中集成 LangChain Agent Loop，实现多工具调用（查询用户、发邮件、网络搜索、数据库增删改查、定时任务），通过 SSE 流式返回。

## 项目架构

```
examples/cron-job-tool/
├── src/
│   ├── ai/                     ← AI 核心模块
│   │   ├── ai.module.ts        ← 导入 ToolModule，注入 QUERY_USER_TOOL
│   │   ├── ai.service.ts       ← Agent Loop + 流式 Agent Loop（6个工具）
│   │   ├── ai.controller.ts    ← GET /ai/chat + SSE /ai/chat/stream
│   │   └── user.service.ts     ← 用户查询服务
│   ├── tool/                   ← 工具模块（所有 Tool 的 Provider）
│   │   ├── tool.module.ts      ← 统一创建+导出 6 个 Tool Provider
│   │   ├── llm.service.ts      ← LLM 模型工厂
│   │   ├── send-mail-tool.service.ts
│   │   ├── web-search-tool.service.ts
│   │   ├── db-users-crud-tool.service.ts
│   │   ├── time-now-tool.service.ts
│   │   └── cron-job-tool.service.ts
│   ├── job/                    ← 定时任务实体的 CRUD 模块
│   ├── users/                  ← 用户数据库 CRUD 模块（TypeORM）
│   └── app.module.ts           ← 根模块（TypeORM + Mailer + Schedule + Config）
```

## 核心模式

### 1. Tool 的 Provider 化

每个 Tool 不再内联定义，而是通过 `useFactory` 创建为独立 Provider：

```ts
// tool/tool.module.ts
@Module({
  providers: [
    {
      provide: 'SEND_MAIL_TOOL',           // 注入标识
      useFactory: (svc: SendMailToolService) => svc.tool,
      inject: [SendMailToolService],
    },
    // WEB_SEARCH_TOOL, DB_USERS_CRUD_TOOL, TIME_NOW_TOOL, CRON_JOB_TOOL 同理
  ],
  exports: ['SEND_MAIL_TOOL', 'WEB_SEARCH_TOOL', ...],  // 导出供其他模块注入
})

// ai/ai.service.ts — 注入所有工具
constructor(
  @Inject('CHAT_MODEL') model: ChatOpenAI,
  @Inject('QUERY_USER_TOOL') private queryUserTool,
  @Inject('SEND_MAIL_TOOL') private sendMailTool,
  @Inject('WEB_SEARCH_TOOL') private webSearchTool,
  // ...
) {
  this.modelWithTools = model.bindTools([...所有工具]);
}
```

### 2. Agent Loop（同步版）

```ts
async runChain(query: string): Promise<string> {
  const messages = [new SystemMessage(...), new HumanMessage(query)];

  while (true) {
    const aiMessage = await this.modelWithTools.invoke(messages);
    messages.push(aiMessage);

    const toolCalls = aiMessage.tool_calls ?? [];
    if (!toolCalls.length) return aiMessage.content as string;  // ← 结束

    for (const tc of toolCalls) {
      // 按 toolName 分发到对应工具
      if (tc.name === 'send_mail')
        await this.sendMailTool.invoke(tc.args);
      if (tc.name === 'web_search')
        await this.webSearchTool.invoke(tc.args);
      // ...
      messages.push(new ToolMessage({ tool_call_id, name, content: result }));
    }
  }
}
```

### 3. Agent Loop（流式版）

关键差异：不直接 `invoke` 而是 `stream`，用 `concat` 拼接 chunk，用 `tool_call_chunks` 判断是否正在调工具：

```ts
async *runChainStream(query: string): AsyncIterable<string> {
  const messages = [...];
  while (true) {
    const stream = await this.modelWithTools.stream(messages);
    let fullMessage: AIMessageChunk | null = null;

    for await (const chunk of stream) {
      fullMessage = fullMessage ? fullMessage.concat(chunk) : chunk;
      const isTool = (fullMessage.tool_call_chunks?.length ?? 0) > 0;
      if (!isTool && chunk.content) yield chunk.content as string;  // ← 流式输出文本
    }

    const toolCalls = fullMessage.tool_calls ?? [];
    if (!toolCalls.length) return;  // 最终回答已流完

    // 执行工具，写回 ToolMessage，进入下一轮（不 yield 给用户）
    for (const tc of toolCalls) { /* 和同步版一样 */ }
  }
}
```

### 4. 工具类型速览

| 工具 | 功能 | 实现方式 |
|------|------|---------|
| `query_user` | 查用户信息 | AiModule useFactory |
| `send_mail` | 发邮件 | nodemailer + MailerModule |
| `web_search` | 网络搜索 | Bocha API HTTP 调用 |
| `db_users_crud` | 数据库增删改查 | TypeORM Repository |
| `time_now` | 获取当前时间 | `new Date().toISOString()` |
| `cron_job` | 定时任务管理 | `@nestjs/schedule` SchedulerRegistry |

### 5. 定时任务 Cron Job 的设计 — 任务调度架构

```
用户说 "1分钟后提醒我喝水"
  │
  ▼
AiService.runChain(query)
  → Agent Loop → LLM 决定调 cron_job.add({ type: "at", at: "...", instruction: "提醒我喝水" })
  → cronJobTool.invoke(args)
  → CronJobToolService → JobService.addJob(...)
  │
  ├── 存入 MySQL（Job 表：id/instruction/type/cron/everyMs/at/isEnabled）
  └── startRuntime(job)
        │
        ▼
      setTimeout(delay, () => {          // at 类型
        // 或 new CronJob(expr, () => {})  // cron 类型
        // 或 setInterval(ms, () => {})     // every 类型
        JobAgentService.runJob("提醒我喝水")  ← 另起一个 Agent Loop
          → bindTools([send_mail, web_search, db_users_crud, time_now])
          → （没有 cron_job！防止嵌套创建定时任务）
          → 执行完 → 结果记日志
      })
```

### 两个独立的 Agent Loop

| | AiService.runChain | JobAgentService.runJob |
|--|-------------------|----------------------|
| 触发 | HTTP 请求 | 定时器到期 |
| 绑定工具 | 6 个（含 cron_job） | 4 个（不含 cron_job） |
| 目的 | 响应用户交互 | 执行后台任务 |
| 结果 | SSE 流式返回 | 写入日志 |

### 启动恢复

`onApplicationBootstrap()` 从 MySQL 读取 `isEnabled=true` 的 Job，重新注册到 SchedulerRegistry——服务重启不丢定时任务。

### 三种调度方式

| 类型 | 实现 | 场景 |
|------|------|------|
| `cron` | `new CronJob(expr, fn)` | 复杂周期（每周一 9:00） |
| `every` | `setInterval(fn, ms)` | 固定间隔（每 5 分钟） |
| `at` | `setTimeout(fn, delay)` | 一次性定时（1 分钟后） |

## Tool 内部结构深度解析

### `tool(fn, config)` 签名

```ts
tool(
  async ({ action, id, name, email }) => { /* 回调 */ },  // 参数1：业务逻辑
  {                                                         // 参数2：配置
    name: 'db_users_crud',           // LLM 看到的工具名
    description: '增删改查用户...',  // LLM 据此判断何时调用
    schema: dbUsersCrudArgsSchema,   // Zod Schema：约束参数类型和必填
  },
)
```

### Schema → LLM → 回调的完整链路

```
Schema（你定义的）  →  LLM 的 function calling  →  回调函数的参数
────────────────────────────────────────────────────────────
action: enum        →  描述告诉 LLM 这个工具干吗  →  toolCall.args
id: number (opt)    →  LLM 决定调用后按 schema    = { action: "get",
name: string (opt)  →  生成参数，保证类型正确        id: 3 }
email: string (opt) →                            → 传入你的回调
```

### Agent Loop while(true) 为什么不会死循环

```ts
while (true) {
  const aiMessage = await this.modelWithTools.invoke(messages);
  const toolCalls = aiMessage.tool_calls ?? [];
  if (!toolCalls.length) return aiMessage.content as string;  // ← 唯一退出点
  for (const tc of toolCalls) {
    const result = await someTool.invoke(tc.args);  // 执行工具
    messages.push(new ToolMessage({ content: result }));  // 结果写回上下文
  }
  // → 回到 while 顶部，LLM 看到工具结果，继续或结束
}
```

## 前端 SSE 页面

```html
<script>
const es = new EventSource(`/ai/chat/stream?query=${encodeURIComponent(query)}`);
es.onmessage = (event) => { outputEl.textContent += event.data; };
es.onerror = () => es.close();
</script>
```

---

## 深度答疑

### ① ReAct 每轮都查时间/用户名，浪费 token？

**确实会浪费，这是 ReAct 的固有成本。** 生产环境优化方案：

| 方案 | 做法 | 适合场景 |
|------|------|---------|
| System Prompt 预注入 | `SystemMessage("当前时间：${now}\n用户：${name}")` | 固定上下文 |
| 缓存 | `if (toolName==='time_now' && cache.has('time_1s')) return cache` | 高频重复查询 |
| Plan & Execute | 先让 LLM 一次性规划所有工具 → 并行执行 → 一次性回答 | 步骤固定的流程 |
| ReAct | 接受 token 成本 | 需要动态决策 |

### ② cron_job 创建了但任务不执行

`cron_job.add()` 只是**写入数据库**，真正执行靠 `JobService.startRuntime()` → `JobAgentService.runJob()`。

排查清单：
1. `job-agent.service.ts` 是否在模块里注册
2. 调度器轮询间隔是否太短/还没到触发时间
3. `at` 类型的时间是否有时区问题
4. `instruction` 是否被 LLM 写成了工具调用格式而非自然语言

### ③ 第3轮只到"设置任务"就结束，正常吗？

**正常。** 正确设计：
```
当前轮：登记任务 → 告诉用户"已创建" ✅
未来轮：job-agent 触发 → 真正执行 ✅
```

System Prompt 明确约束："本轮对话只用 cron_job 设置任务，不要在当前轮直接完成这个动作本身"。

### ④ `if (!fullAIMessage) return` 为什么这样判断

```ts
let fullAIMessage: AIMessageChunk | null = null;
for await (const chunk of stream) {
  fullAIMessage = fullAIMessage ? fullAIMessage.concat(chunk) : chunk;
}
if (!fullAIMessage) return;  // stream 一个 chunk 都没有 → 防御性退出
```

可能触发场景：网络超时、API 限流、模型返回空响应。没有这个判断 → `messages.push(null)` → `null.tool_calls` → 崩溃。

---

## Tool 标准骨架（速查模板）

所有 tool 遵循同一模式：

```ts
@Injectable()
export class XxxToolService {
  readonly tool;                          // ① 工具实例

  @Inject(XxxService)                     // ② 注入业务服务（constructor 前已完成）
  private readonly xxxService: XxxService;

  constructor() {
    const schema = z.object({             // ③ Zod Schema：LLM 靠这个知道参数格式
      action: z.enum(['a','b']).describe('操作类型'),
      id: z.number().optional().describe('ID'),
    });

    this.tool = tool(                     // ④ 工具定义
      async ({ action, id }) => {
        switch (action) {
          case 'a': return '结果字符串';   // ⑤ 必须 return string
          case 'b': if (!id) return '报错'; // ⑥ 错误用 return 不用 throw
        }
      },
      { name: 'tool_name', description: '用途', schema },
    );
  }
}
```

### 三个关键细节

**`.describe()` 决定 LLM 传参质量：**
```ts
// ❌ 模糊
at: z.string().optional().describe('时间')
// ✅ 精确
at: z.string().optional().describe('指定触发时间点，ISO 字符串如 2026-03-18T12:34:56.000Z')
```

**返回值必须对 LLM 友好：**
```ts
// ❌ return { id: 1, name: '张三' }       → LLM 读不懂
// ✅ return 'ID=1，姓名=张三，邮箱=z@x.com' → LLM 能理解
```

**五个 Tool 复杂度：** `time-now` ★☆☆ → `send-mail` ★★☆ → `web-search` ★★★ → `db-users-crud` ★★★★ → `cron-job` ★★★★★

---

## 三个 Nest 核心概念

### 1. `forwardRef` — 循环依赖

`ToolModule → JobModule` 且 `JobModule → ToolModule`，互相引用。用 `forwardRef(() => Module)` 延迟求值解决：

```
没有 forwardRef：NestJS "先初始化谁？" → 💥 报错
有 forwardRef：  NestJS "先建壳，再互相填充引用" → ✅
```

### 2. `SchedulerRegistry` — 运行时任务登记表

`@nestjs/schedule` 提供的内存调度器，管理三个 Map：

| 方法 | 作用 |
|------|------|
| `addCronJob/Interval/Timeout(id, ref)` | 注册 |
| `getCronJobs/Intervals/Timeouts()` | 查询 |
| `deleteCronJob/Interval/Timeout(id)` | 删除 |

`onApplicationBootstrap()` 用它将数据库中的 `isEnabled=true` 任务恢复到内存。

### 3. `CronJob` — cron 库的任务实例

```ts
import { CronJob } from 'cron';
const job = new CronJob('*/5 * * * * *', () => { ... });  // 每5秒
job.start();
```

Cron 表达式（6位）：`秒 分 时 日 月 星期`

### 4. 为什么不用 Redis？为什么数据库 + 内存双层？

**`setTimeout` / `setInterval` / `CronJob` 返回的是进程内存中的"句柄对象"，无法序列化存入 Redis。** Redis 和 SchedulerRegistry 不是同一层的东西：

| | 数据库 | SchedulerRegistry | Redis |
|--|--------|-------------------|-------|
| 存什么 | 任务描述（纯数据） | Timer/CronJob 句柄 | Key-Value 数据 |
| 持久化 | ✅ 永久 | ❌ 进程存活期间 | ✅ |
| 超时触发 | ❌ 不能 | ✅ 真正倒计时 | ❌ 不能 |

**类比：**
```
数据库 = 备忘录本子 → "明天早上8点叫我起床"
SchedulerRegistry = 手机闹钟 → 真正在倒计时、到点会震动
光有备忘录不会叫你起床，必须"设置成闹钟"才会触发
```

**两者缺一不可：**
- 只有数据库 → 读到任务但没注册 Timer → 永远不触发 ❌
- 只有 SchedulerRegistry → 重启后内存清空 → 任务全部丢失 ❌
- 两者配合 → 数据库持久化 + 内存执行 + `onApplicationBootstrap` 重启同步 ✅

**Redis 的定位：** 解决分布式多实例问题（Bull/BullMQ 任务队列），和本地调度不在同一维度。

## 完整执行链路

```
服务器启动
  → ToolModule ←forwardRef→ JobModule（循环依赖解决）
  → onApplicationBootstrap() 从 MySQL 恢复 isEnabled=true 的 Job 到 SchedulerRegistry

用户："1分钟后发笑话邮件"
  → AiService Agent Loop
     Round1: time_now → "20:07"
     Round2: cron_job.add → 存 MySQL → startRuntime() → setTimeout(60s) → 注册到 SchedulerRegistry
     Round3: toolCalls=[] → "已设置"  ← 结束，不发邮件

60秒后...
  → SchedulerRegistry 触发 Timeout
  → JobAgentService.runJob("发笑话")  ← 另起 Agent Loop（无 cron_job tool）
     Round1: web_search("笑话") → 搜索结果
     Round2: send_mail(...) → 发送完成
     Round3: toolCalls=[] → 任务完成
  → 更新 MySQL + 清理 SchedulerRegistry
```

---

## 关键对比：hello-nest-langchain vs cron-job-tool

| | hello-nest | cron-job-tool |
|--|-----------|---------------|
| 工具数量 | 0（无 tool） | 6 个 |
| Tool 定义位置 | 无 | 独立 module + useFactory |
| Agent Loop | 无 | 同步 + 流式两个版本 |
| 外部服务 | 无 | MySQL、SMTP、Bocha API |
| 调度 | 无 | @nestjs/schedule |
| 定时执行 | 无 | JobAgentService + SchedulerRegistry |

## 心得

- **Tool 的 Provider 化**：每个 Tool 是独立可测试的 Provider，通过 DI 注入到 AiService
- **流式 Agent Loop 的精髓**：`chunk.content` 只在没有 `tool_call_chunks` 时才 yield——用户看不到工具调用过程
- **定时任务的设计**：Tool 只负责创建/管理，真正执行由 JobAgentService 另起 Agent Loop——关注点分离
- **两个 Agent Loop 隔离**：交互 Loop 有 cron_job，定时 Loop 没有——防嵌套创建
