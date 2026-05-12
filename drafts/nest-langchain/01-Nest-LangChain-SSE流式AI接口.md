# Nest + LangChain 实现 SSE 流式 AI 接口

## 学习目标

之前 LangChain 都在 Node.js 脚本里跑。实际生产环境中，AI 接口跑在后端服务里。本章学习：

1. **Nest.js 基础**：Module / Controller / Service / DI（依赖注入）
2. **LangChain 集成**：ChatModel 用 `useFactory` 创建 Provider
3. **SSE 流式返回**：`async *generator` → `Observable` → `EventSource`
4. **前端调用**：`EventSource.onmessage` 接收流式数据

---

## 项目结构

```
examples/hello-nest-langchain/
├── src/
│   ├── ai/
│   │   ├── ai.module.ts       ← 模块定义 + useFactory 注入 ChatModel
│   │   ├── ai.service.ts      ← 业务逻辑（chain + invoke/stream）
│   │   └── ai.controller.ts   ← 路由（同步 + SSE 流式）
│   ├── book/                  ← 示例 CRUD 模块（Nest 基础教学用）
│   ├── app.module.ts          ← 根模块（引入 ConfigModule、AiModule）
│   └── main.ts                ← 入口
├── public/
│   └── sse-test.html          ← 前端 SSE 调用示例
├── .env                       ← 需手动创建
└── package.json
```

---

## Nest 核心概念速览

### MVC 三层

```
Controller（路由层）  →  Service（业务层）  →  Module（组织层）
   GET /ai/chat          runChain()              providers + imports
   SSE /ai/chat/stream   streamChain()
```

### DI（依赖注入）

```ts
// 方式 1：构造器注入（最常用）
@Injectable()
class AiService {
  constructor(@Inject('CHAT_MODEL') model: ChatOpenAI) {}
}

// 方式 2：属性注入
@Injectable()
class AiService {
  @Inject('CHAT_MODEL')
  private model: ChatOpenAI;
}
```

### Provider 创建方式

```ts
// 方式 1：直接用 @Injectable 声明的 class
providers: [AiService]

// 方式 2：useFactory 工厂函数（本章用的方式）
{
  provide: 'CHAT_MODEL',
  useFactory: (configService: ConfigService) => {
    return new ChatOpenAI({
      model: configService.get('MODEL_NAME'),
      apiKey: configService.get('OPENAI_API_KEY'),
      configuration: { baseURL: configService.get('OPENAI_BASE_URL') },
    });
  },
  inject: [ConfigService],  // useFactory 的依赖
}
```

---

## 核心代码解析

### 1. AiService — Chain 定义 + 调用

```ts
// src/ai/ai.service.ts
@Injectable()
export class AiService {
  private readonly chain: Runnable;

  constructor(@Inject('CHAT_MODEL') model: ChatOpenAI) {
    const prompt = PromptTemplate.fromTemplate('请回答以下问题：\n\n{query}');
    this.chain = prompt.pipe(model).pipe(new StringOutputParser());
  }

  // 同步调用
  async runChain(query: string): Promise<string> {
    return this.chain.invoke({ query });
  }

  // 流式调用（生成器语法 async * + yield）
  async *streamChain(query: string): AsyncGenerator<string> {
    const stream = await this.chain.stream({ query });
    for await (const chunk of stream) {
      yield chunk;
    }
  }
}
```

### 2. AiController — 路由 + SSE

```ts
// src/ai/ai.controller.ts
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // 同步接口：GET /ai/chat?query=你好
  @Get('chat')
  async chat(@Query('query') query: string) {
    const answer = await this.aiService.runChain(query);
    return { answer };
  }

  // 流式接口：SSE /ai/chat/stream?query=你好
  @Sse('chat/stream')
  chatStream(@Query('query') query: string): Observable<{ data: string }> {
    return from(this.aiService.streamChain(query)).pipe(
      map((chunk) => ({ data: chunk }))
    );
  }
}
```

**SSE 数据流向：**
```
AiService.streamChain()         rxjs                     HTTP Response
  async * yield chunk1  →  from() Observable  →  SSE data: "chunk1"
     yield chunk2                                   data: "chunk2"
     yield chunk3                                   data: "chunk3"
```

### 3. AiModule — 依赖注入配置

```ts
// src/ai/ai.module.ts
@Module({
  controllers: [AiController],
  providers: [
    AiService,
    {
      provide: 'CHAT_MODEL',              // 注入标识
      useFactory: (configService) =>      // 工厂函数
        new ChatOpenAI({ ...configService.get(...) }),
      inject: [ConfigService],            // 工厂的依赖
    },
  ],
})
```

### 4. AppModule — 全局配置

```ts
// src/app.module.ts
@Module({
  imports: [
    // 静态文件服务（让 public/sse-test.html 可访问）
    ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'public') }),
    // 全局配置（isGlobal: true，任何模块都能注入 ConfigService）
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    AiModule,
    BookModule,
  ],
})
```

### 5. 前端 SSE 调用

```html
<!-- public/sse-test.html -->
<script>
const eventSource = new EventSource('/ai/chat/stream?query=你好');
eventSource.onmessage = (event) => {
  document.body.innerText += event.data;  // 逐段追加
};
</script>
```

---

## 运行步骤

```bash
# 1. 安装依赖
cd examples/hello-nest-langchain
pnpm install

# 2. 创建 .env 文件（填入你的配置）
#    OPENAI_API_KEY=xxx
#    OPENAI_BASE_URL=https://api.deepseek.com
#    MODEL_NAME=deepseek-chat

# 3. 启动开发服务器
pnpm start:dev

# 4. 测试同步接口
curl "http://localhost:3000/ai/chat?query=什么是Nest"

# 5. 测试流式接口
curl "http://localhost:3000/ai/chat/stream?query=什么是SSE"

# 6. 浏览器访问前端页面
open http://localhost:3000/sse-test.html
```

---

## 关键对比：脚本模式 vs 服务模式

| | Node.js 脚本 | Nest 服务 |
|--|-------------|----------|
| 启动方式 | `node xxx.mjs` | `pnpm start:dev`（持久运行） |
| 调用方式 | `chain.invoke({})` | HTTP 请求 |
| 流式 | `process.stdout.write` | SSE `EventSource.onmessage` |
| 配置 | 硬编码 / `process.env` | `ConfigService`（可切换） |
| 模型 | 直接 new | `useFactory` 注入（解耦） |
| 复用 | 每文件独立 | Service 单例 |

## 心得

- Nest 的 Module/Controller/Service 三层和前面学的 LCEL Pipeline 思想一致：**拆零件 → 组合 → 统一调用**
- `useFactory` + `@Inject` 解决了「模型怎么创建，谁来管」的问题——模型是 Provider，和业务逻辑解耦
- SSE 的 `async *generator` + `Observable` 本质上和前端的 `arr.map().filter()` 声明式思维一致
