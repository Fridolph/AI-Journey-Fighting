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

### 5. 定时任务 Cron Job 的设计

这是本章核心——通过 Tool 接口让 AI 能创建/管理定时任务：

```
用户："1分钟后提醒我喝水"
  → LLM 返回 tool_call: cron_job.add({ type: "at", at: "2025-...", instruction: "提醒我喝水" })
  → AiService 执行 cronJobTool.invoke(args)
  → CronJobToolService 创建 CronJob + 写入数据库
  → 到期后 SchedulerRegistry 触发 JobService.execute()
  → 启动新的 Agent Loop，用 instruction 作为 prompt 执行
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

## 心得

- **Tool 的 Provider 化**：每个 Tool 是独立可测试的 Provider，通过 DI 注入到 AiService。这比把所有逻辑写在一个文件里清晰得多
- **流式 Agent Loop 的精髓**：`chunk.content` 只在没有 `tool_call_chunks` 时才 yield——用户看不到工具调用的过程，只看到最终回答流
- **定时任务的设计**：Tool 不直接执行任务，只负责创建/管理。真正执行时另起 Agent Loop——关注点分离
