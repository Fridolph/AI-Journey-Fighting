# NestJS

NestJS 是一个基于 TypeScript 的后端框架，底层支持 Express 或 Fastify。对前端转后端的工程师友好——装饰器、依赖注入、模块化这些概念和 Angular 一脉相承，写惯 React 的看 NestJS 不会有太大违和感。

## 核心概念

### 模块（Module）

```typescript
@Module({
  imports: [TypeOrmModule.forRoot(...)],
  controllers: [BookController],
  providers: [BookService],
})
export class AppModule {}
```

模块是 NestJS 的组织单元，相当于一个功能域。一个应用至少有一个根模块。

### 控制器（Controller）

```typescript
@Controller('book')
export class BookController {
  @Get()
  findAll() { return this.bookService.findAll(); }

  @Post()
  create(@Body() dto: CreateBookDto) { return this.bookService.create(dto); }
}
```

装饰器 `@Get()/@Post()/@Put()/@Delete()` 定义路由，`@Body()/@Param()/@Query()` 提取请求参数。

### 服务（Provider）

```typescript
@Injectable()
export class BookService {
  constructor(@InjectRepository(Book) private repo: Repository<Book>) {}

  findAll() { return this.repo.find(); }
  create(dto: CreateBookDto) { return this.repo.save(dto); }
}
```

`@Injectable()` 让类可被 DI 容器管理。通过构造函数注入依赖。

### TypeORM 集成

```typescript
// Entity
@Entity()
export class Book {
  @PrimaryGeneratedColumn() id: number;
  @Column() title: string;
  @Column() author: string;
}

// Module
TypeOrmModule.forRoot({
  type: 'mysql',
  host: 'localhost',
  database: 'book',
  entities: [Book],
  synchronize: true,
}),
TypeOrmModule.forFeature([Book]),
```

## 与 AI 开发的结合点

NestJS 在 AI Agent 开发中承担**后端服务层**的角色：

- 提供 RESTful API 给前端 AI 交互界面
- 管理数据库连接（MySQL/PostgreSQL）
- 调度中间件（Milvus 向量检索、Redis 缓存）
- LangChain 集成（`@langchain/openai` 在 NestJS 服务中调用）

典型 AI 应用的 NestJS 项目结构：

```
src/
├── ai/
│   ├── ai.controller.ts    # AI 对话接口
│   ├── ai.service.ts       # LangChain/LangGraph 调用
│   └── ai.module.ts
├── book/                    # 业务 CRUD
├── common/                  # 守卫、拦截器、管道
└── main.ts
```

## Dockerfile 打包

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

## 静态文件配置

```json
// nest-cli.json
{
  "compilerOptions": {
    "assets": [{ "include": "../public/**/*", "outDir": "dist/public" }]
  }
}
```

`public/` 目录默认不输出到 `dist/`，需显式声明。

## 常用命令

```bash
nest new my-app                    # 新建项目
nest g res book --no-spec         # 生成 CRUD 模块
nest build                         # 编译
npm run start:dev                  # 本地开发（hot reload）
node dist/main.js                  # 生产运行
```

## 相关示例

- `examples/nest-dockerfile-test/` — NestJS + Docker Compose 部署
- `examples/nest-langchain/` — NestJS 集成 LangChain
- `examples/advanced-rag/` — NestJS 后端 + LangGraph RAG

---

## 参考资源

- [NestJS 官方文档](https://docs.nestjs.com/)
- [NestJS CLI](https://docs.nestjs.com/cli/overview)
- [TypeORM 文档](https://typeorm.io/)

