# NestJS

NestJS 是一个基于 TypeScript 的后端框架，底层支持 Express 或 Fastify。装饰器、依赖注入、模块化这些概念和 Angular 一脉相承，对前端转后端的工程师比较友好。

---

## 一、模块与依赖注入

### 1. IoC 与 DI 解决什么问题

**不使用 DI 时：**

```ts
class UserService {
  private prisma = new PrismaService() // 自己创建依赖
}
```

- 强耦合，无法替换实现。
- 测试时无法 mock。
- 每个类各自 `new` 一份，数据库连接等资源无法共享。

**使用 DI 时：**

```ts
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}
}
```

类只声明"需要什么"，由 Nest 容器负责创建、缓存和注入。这就是**控制反转（IoC）**：对象的创建权从业务代码转移到容器。**依赖注入（DI）**是实现 IoC 的具体手段。

### 2. Nest 如何知道要注入什么

1. TypeScript 开启 `emitDecoratorMetadata` 后，编译产物会记录构造函数的**参数类型**。
2. Nest 通过 `reflect-metadata` 读取这些类型，把**类本身**当作注入令牌（token）。
3. 容器在当前模块可见的 providers 中查找对应实例并注入。

**推论：**

- `interface` 和 `type` 在运行时不存在，不能作为注入令牌。注入接口时要使用自定义 token：`@Inject('TOKEN')`、`Symbol`，或者改用抽象类。
- DTO 如果用 `import type` 导入，编译后参数类型会退化为 `Object`，拿不到类元数据，依赖元数据的 `ValidationPipe`（class-validator 方案）就无法工作。

### 3. 模块的四个字段与可见性

```ts
@Module({
  imports: [PrismaModule],        // 引入其他模块导出的 provider
  controllers: [UserController],
  providers: [UserService],       // 本模块内可注入的 provider
  exports: [UserService],         // 允许其他模块使用的 provider
})
export class UserModule {}
```

**Provider 默认是模块私有的。** 跨模块使用需要同时满足：

1. 提供方模块在 `exports` 中导出。
2. 使用方模块在 `imports` 中引入提供方模块。

`@Global()` 可以省去重复 imports（如 `PrismaModule`、`ConfigModule`），但会让依赖关系变得不透明，只用于真正全局的基础设施。

### 4. Provider 的作用域

| 作用域 | 行为 | 场景 |
|---|---|---|
| `DEFAULT` | 整个应用共享一个单例 | 绝大多数 Service |
| `REQUEST` | 每个请求创建新实例 | 需要按请求保存上下文 |
| `TRANSIENT` | 每个注入点获得独立实例 | 轻量、无共享状态的工具 |

- `REQUEST` 作用域会**向上传染**：依赖它的 Provider 和 Controller 都会变成请求级，每次请求都要重新实例化，有性能开销。
- 请求级上下文优先考虑 `AsyncLocalStorage`（如 `nestjs-cls`），不必让整条依赖链变成请求级。

### 5. 单例 Service 不能保存请求状态

```ts
@Injectable()
export class UserService {
  private currentUser: User // ❌ 被所有请求共享
}
```

问题出现在异步让出点（`await`）：

```text
请求 A（Alice）: currentUser = Alice
                 ↓ await 查询数据库（让出执行权）
请求 B（Bob）:   currentUser = Bob
                 ↓
请求 A 继续执行: 读到 currentUser = Bob  ❌
```

Node.js 虽然是单线程，但同步代码不会被打断，一旦存在 `await`，事件循环就会切换到其他请求。业务里几乎一定有 `await`（查库、调外部接口），所以这个问题必然出现。

**解决方案：**

| 方案 | 做法 | 评价 |
|---|---|---|
| 参数传递 | Guard 把用户挂到 `request.user`，Controller 取出后作为参数传给 Service | **首选**，显式、简单 |
| 自定义参数装饰器 | `@CurrentUser()` 封装读取逻辑 | 配合参数传递使用 |
| AsyncLocalStorage | 入口存入上下文，任意深度代码可读 | 适合深调用链、追踪 ID、多租户 |
| REQUEST 作用域 | 每个请求创建新实例 | 能用但不推荐 |

```ts
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
)

@Post()
create(@Body() dto: CreateUserDto, @CurrentUser() operator: JwtPayload) {
  return this.userService.create(dto, operator)
}
```

原则：单例 Service 只放**无请求状态**的依赖和逻辑，请求相关数据通过参数传递。

### 6. 自定义 Provider 的四种形态

```ts
providers: [
  UserService,                                   // 简写，等价于 useClass
  { provide: 'APP_NAME', useValue: 'my-app' },  // 固定值
  { provide: 'MAILER', useClass: SmtpMailer },  // 可按环境替换实现
  {
    provide: 'REDIS',                            // 工厂：可异步，可注入其他依赖
    useFactory: async (config: ConfigService) => createRedis(config.get('REDIS_URL')),
    inject: [ConfigService],
  },
]
```

```ts
constructor(@Inject('REDIS') private readonly redis: Redis) {}
```

`useFactory` 加 `inject` 是连接数据库、Redis、Milvus 等外部资源的标准写法。

### 7. 循环依赖

A 依赖 B，B 又依赖 A，启动时会报错，或者注入进来的是 `undefined`。

- **临时解法：** 两边都使用 `forwardRef`。

  ```ts
  constructor(@Inject(forwardRef(() => BService)) private b: BService) {}
  ```

- **根本解法：** 把循环视为设计信号。
  - 抽出第三个公共 Service，两边都依赖它。
  - 改用事件（`EventEmitter`）解耦。

### 8. 动态模块

`forRoot` / `forRootAsync` 属于动态模块，让模块在被引入时接收配置：

```ts
@Module({})
export class RedisModule {
  static forRoot(options: { url: string }): DynamicModule {
    return {
      module: RedisModule,
      providers: [{ provide: 'REDIS_OPTIONS', useValue: options }],
      exports: ['REDIS_OPTIONS'],
    }
  }
}
```

命名约定：

- `forRoot`：全局只配置一次。
- `forFeature`：各模块按需注册自己用到的部分。
- `register`：每个使用方独立配置。

---

## 二、请求生命周期

### 1. 完整执行顺序

```text
请求进入
  ↓
Middleware
  ↓
Guard
  ↓
Interceptor（前置）
  ↓
Pipe
  ↓
Controller 方法 → Service
  ↓
Interceptor（后置）
  ↓
Exception Filter（仅在抛出异常时介入）
  ↓
响应返回
```

### 2. 各组件的分工

| 组件 | 能拿到什么 | 典型用途 | 能否中断请求 |
|---|---|---|---|
| Middleware | `req`、`res`、`next` | 日志、CORS、请求 ID、解析 Cookie | 能（不调用 `next`） |
| Guard | `ExecutionContext` | 认证、权限、角色 | 能（返回 `false` 或抛异常） |
| Interceptor | `ExecutionContext` + 响应流 | 统一响应、耗时统计、缓存、超时 | 能（不调用 `next.handle()`） |
| Pipe | 单个参数值 | 参数校验、类型转换 | 能（抛异常） |
| Filter | 异常对象 | 统一错误响应 | 负责收尾 |

### 3. 为什么权限校验放在 Guard，而不是 Middleware

- Middleware 在处理器确定之前执行，不知道将要执行哪个 Controller 方法，**读不到 `@Roles('admin')` 这类元数据**。
- Guard 通过 `ExecutionContext` 加 `Reflector`，可以读取目标处理器和类上的元数据。
- 用户信息并不是 Guard 独有的，Middleware 同样可以解析 token 并挂到 `req.user`。真正的区别是**元数据**。
- Guard 的语义就是"放行或拒绝"，职责更清晰。

```ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ])
    if (!roles) return true
    const { user } = context.switchToHttp().getRequest()
    return roles.some(role => user.roles.includes(role))
  }
}
```

### 4. Interceptor 为什么能同时处理请求前和请求后

它基于 **RxJS**。`next.handle()` 返回 Observable：调用之前是前置逻辑，通过 `pipe` 处理返回值就是后置逻辑。

```ts
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const start = Date.now()                 // 前置
    return next.handle().pipe(
      map(data => ({ code: 0, data })),      // 后置：统一包装
      tap(() => console.log(`${Date.now() - start}ms`)),
    )
  }
}
```

### 5. Controller 抛异常时，Interceptor 的后置逻辑还会执行吗

不一定。异常走的是 Observable 的 **error 通道**，不是 next 通道：

| 操作符 | 异常时是否执行 |
|---|---|
| `map(...)` | 不执行 |
| `tap(fn)` | 不执行 |
| `tap({ error: fn })` | 执行 |
| `catchError(fn)` | 执行，可转换或吞掉错误 |
| `finalize(fn)` | 执行，成功失败都会触发 |

```ts
return next.handle().pipe(
  map(data => ({ code: 0, data })),                  // 异常时不执行
  catchError(err => throwError(() => err)),          // 异常时执行
  finalize(() => console.log(`${Date.now() - start}ms`)), // 总会执行
)
```

- 行为由 **RxJS 流**决定，与 Node.js 单线程、`async/await` 无关。
- 耗时统计、资源清理这类"无论成败都要执行"的逻辑，用 `finalize`。
- Guard 或更早阶段失败时，请求根本不会进入 Interceptor，所以不要假设"前置执行了，后置就一定执行"。

### 6. 统一响应结构

**职责划分：**

- **成功：** Interceptor 用 `map` 包装为 `{ code: 0, data, message }`。
- **失败：** Filter 输出结构一致的 `{ code, message, data: null }`。
- `map` 只在成功时执行，Filter 只在异常时执行，两者不重叠。

**注意事项：**

- 成功与失败的结构必须一致，否则前端要写两套解析逻辑。
- **保留语义化的 HTTP 状态码**（`401`、`403`、`409` 等），业务码放 body。如果全部返回 `200`，监控、网关、重试机制都会失效。
- 文件下载、SSE 流式输出不应被包装成 JSON。可以用自定义装饰器（如 `@SkipResponseWrap()`）配合 `Reflector` 跳过。AI 对话的流式接口就属于这类。

### 7. ValidationPipe 常用配置

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,              // 去掉 DTO 中未声明的字段
  forbidNonWhitelisted: true,   // 出现多余字段直接报错
  transform: true,              // 自动转换为 DTO 类实例和目标类型
}))
```

`whitelist` 能防止**批量赋值攻击**，比如客户端偷偷多传 `isAdmin: true`。

### 8. 全局组件如何使用依赖注入

- `app.useGlobalGuards(new XxxGuard())` 在模块之外创建实例，**无法注入依赖**。
- 推荐在模块中使用令牌注册：

```ts
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  { provide: APP_PIPE, useClass: ValidationPipe },
]
```

### 9. 多层级绑定与执行顺序

Guard、Interceptor、Pipe、Filter 都可以绑定在**全局 → Controller → 方法**三个层级。

- **进入时：** 全局先于 Controller，Controller 先于方法。
- **Interceptor 后置部分：** 顺序反过来，类似洋葱模型。
- **Filter：** 最靠近处理器的先尝试捕获，没有匹配再向外层传递。

## 三、数据层

### 1. Prisma 与 TypeORM 如何选择

| 维度 | Prisma | TypeORM |
|---|---|---|
| 模型定义 | `schema.prisma`，生成客户端 | 装饰器实体类 |
| 类型安全 | 强，结果类型由 `select` 精确推导 | 较弱，复杂查询易丢失类型 |
| 迁移 | `prisma migrate`，基于 schema 差异生成 SQL | 迁移文件，也可自动生成 |
| 复杂查询 | 复杂 SQL 需 `$queryRaw` | `QueryBuilder` 更灵活 |
| Nest 集成 | 无官方模块，自行封装 `PrismaService` | 官方 `@nestjs/typeorm` |

没有绝对优劣：重视类型安全和开发体验选 Prisma，需要复杂查询或已有大量实体选 TypeORM。

`synchronize: true` 会按实体自动改表，生产环境可能丢数据，只适合本地试验。生产使用迁移（migration）。

### 2. PrismaService 的标准封装

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect() }
  async onModuleDestroy() { await this.$disconnect() }
}
```

- 利用生命周期钩子管理连接。
- 需要调用 `app.enableShutdownHooks()`，进程收到 `SIGTERM` 时 `onModuleDestroy` 才会触发。
- Prisma 新版本可能使用 driver adapter，写法略有不同，以项目实际版本为准。

### 3. 事务的三种写法

**嵌套写入（隐式事务）：** 一次调用内的嵌套写入自动在同一事务里，能用就不手写事务。

```ts
prisma.user.create({
  data: { username, roles: { create: { role: { connect: { key } } } } },
})
```

**批量事务：** 操作之间没有依赖时使用，如分页的 `items + total`。

```ts
const [items, total] = await this.prisma.$transaction([
  this.prisma.user.findMany({ where, skip, take }),
  this.prisma.user.count({ where }),
])
```

**交互式事务：** 后一步依赖前一步结果时使用，回调内抛异常自动回滚。

```ts
await this.prisma.$transaction(async tx => {
  await tx.account.update({ ... })
  await tx.account.update({ ... })
})
```

### 4. 为什么事务回调里必须用 tx

- 事务绑定在**一条数据库连接**上。
- `tx` 是绑定了该连接的客户端；`this.prisma` 走连接池，语句可能落在别的连接。
- 回调里误用 `this.prisma`：
  - 该语句不属于事务，回滚时不会被撤销。
  - 读不到事务内未提交的数据。
  - 连接池较小时可能造成等待甚至死锁。
- 事务有超时限制，不要在事务内调用外部 HTTP 或做耗时计算，会长时间占用连接。

### 5. 唯一性与并发

**"先查再插"为什么不可靠：**

```text
请求 A: 查到用户名不存在
请求 B: 查到用户名不存在
请求 A: 插入成功
请求 B: 插入，触发唯一约束错误
```

**可靠做法：**

1. 数据库层建立唯一索引，这是根本保证。
2. 应用捕获 `P2002`，转换为 `409 Conflict`。
3. "先查"可以保留，用于友好提示并避免无谓的密码哈希，但不是正确性保障。
4. 需要"有就返回，没有就创建"时使用 `upsert`，同样依赖唯一索引。

**软删除与唯一约束：** 唯一索引不区分 `deletedAt`，已删除用户的用户名无法复用。若要复用，需部分唯一索引（PostgreSQL 的 `WHERE deleted_at IS NULL`；MySQL 不支持，需用生成列等变通）。

### 6. Prisma 常见错误码

| 码 | 含义 | 常见映射 |
|---|---|---|
| `P2002` | 唯一约束冲突 | `409` |
| `P2025` | 更新或删除的记录不存在 | 常见 `404`，需结合上下文 |
| `P2003` | 外键约束失败 | `400` 或 `409` |

Prisma 错误不是 `HttpException`，直接抛出会变成 `500`，需要通过全局 Filter 或 Service 局部映射。通用映射交给 Filter，需要业务含义的（如区分用户名/邮箱冲突）再在 Service 局部处理。

### 7. 并发扣减（丢失更新）

```text
余额 10
请求 A: 读到 10，判断够扣 10
请求 B: 读到 10，判断够扣 10
A: 更新为 0
B: 更新为 0   ← 实际扣了 20，账户只少了 10
```

| 方案 | 做法 | 特点 |
|---|---|---|
| 原子条件更新 | 判断放进 `WHERE`，用影响行数确认 | 首选，简单、无锁等待 |
| 悲观锁 | `SELECT ... FOR UPDATE`，Prisma 需 `$queryRaw` | 冲突多时稳妥，会阻塞 |
| 乐观锁 | `version` 字段，更新带版本号，失败重试 | 冲突少时性能好 |
| 提高隔离级别 | `Serializable`，失败重试 | 简单，吞吐下降 |

```ts
const result = await this.prisma.account.updateMany({
  where: { id: fromId, balance: { gte: amount } },
  data: { balance: { decrement: amount } },
})
if (result.count === 0) throw new BadRequestException('余额不足')
```

- 判断与扣减在同一条 SQL 中，数据库对行加锁串行执行。
- 用 `updateMany` 而不是 `update`：后者找不到记录会抛 `P2025`。
- 用 `decrement`，不在应用层先读后算。
- 转账的扣款与加款要放进事务，保证一起成功或一起回滚。

### 8. N+1 与分页

- **N+1：** 先查 N 个用户，再在循环里逐个查角色，共 N+1 次查询。用 `include` / `select` 嵌套查询解决，不要在循环里 `await`。
- **偏移分页（`skip/take`）：** 页码越大越慢，数据变动时可能重复或漏数据。
- **游标分页（`cursor`）：** 性能稳定，适合无限滚动，但不能跳页。
- 必须限制 `take` 的最大值，防止客户端传极大值。

## 四、认证与授权

### 1. 认证与授权的区别

| 概念 | 回答的问题 | 失败状态码 |
|---|---|---|
| 认证（Authentication） | 你是谁 | `401 Unauthorized` |
| 授权（Authorization） | 你能做什么 | `403 Forbidden` |

### 2. JWT 的结构与特点

```text
Header.Payload.Signature
```

- Payload 只是 Base64 编码，不是加密，任何人都能解码。
- Signature 用密钥签名，只保证不被篡改，不保证保密。
- Payload 只放最小必要信息（用户 ID、过期时间、必要时的角色），不放密码、手机号等敏感信息。
- 无状态：服务端不存会话，验签即可，利于横向扩展。
- 代价：签发后在过期前无法主动作废。

### 3. 双令牌方案

| 令牌 | 有效期 | 用途 |
|---|---|---|
| Access Token | 短（如 15 分钟） | 访问接口 |
| Refresh Token | 长（如 7 天） | 换取新的 Access Token |

- Refresh Token 存在服务端（存哈希，不存明文），才能主动作废。
- **轮换：** 每次刷新签发新的 Refresh Token，旧的作废。
- **重用检测：** 已作废的旧 Refresh Token 再次被使用，说明可能被盗，让该用户的令牌全部失效，要求重新登录。
- 登出：删除服务端的 Refresh Token，使其无法续签。

### 4. 让令牌立即失效

双令牌方案只是把失效延迟压缩到 Access Token 的有效期内：登出后，已签发的 Access Token 最多还能用到过期。

要求立即失效（封禁、改密码、强制下线）时：

| 方案 | 做法 | 代价 |
|---|---|---|
| 黑名单 | 存 `jti` 到 Redis，TTL 为剩余有效期，Guard 检查 | 每次请求多一次 Redis 查询 |
| 令牌版本号 | 用户表加 `tokenVersion`，Payload 带版本，Guard 比对，封禁/改密码时自增 | 每次请求要读版本号，可缓存 |
| 缩短有效期 | Access Token 缩到数分钟 | 刷新更频繁 |
| 每次请求查用户状态 | Guard 中按 ID 查当前用户，排除已删除/封禁 | 每次请求一次查询，可加缓存 |

### 5. 密码存储

- 使用加盐的慢哈希：`bcrypt`、`argon2`。
- 不使用 MD5、SHA256 等快速哈希，不使用可还原的加密。
- 登录失败不区分"用户不存在"和"密码错误"，统一提示，避免用户枚举。

### 6. 默认拒绝，显式放行

```ts
// 1. 声明公开接口的装饰器
export const Public = () => SetMetadata('isPublic', true)

// 2. 全局认证 Guard
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) { super() }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true            // 公开接口：直接放行，跳过 token 校验
    return super.canActivate(context)    // 其他接口：校验 token
  }
}

// 3. 使用
@Public()
@Post('login')
login(@Body() dto: LoginDto) { ... }
```

- `@Public()` 用 `SetMetadata` 把标记写在处理器上。
- Guard 用 `Reflector.getAllAndOverride` 同时检查方法和类，方法级优先。
- **公开接口是不需要登录就能访问**，Guard 读到标记后直接放行，不是登录后放行。
- 认证失败应抛 `UnauthorizedException`（`401`）。`canActivate` 返回 `false` 默认是 `403`，语义不对。
- 注册为 `APP_GUARD`：新增接口默认受保护，不会因为忘加 Guard 而暴露。

### 7. 认证与授权两层 Guard

```ts
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },  // 先认证，失败 401
  { provide: APP_GUARD, useClass: RolesGuard },    // 再授权，失败 403
]
```

- 多个全局 Guard 按注册顺序执行；`RolesGuard` 依赖 `request.user`，所以认证 Guard 要先注册。

### 8. 授权模型

| 模型 | 思路 | 适用 |
|---|---|---|
| RBAC | 用户 → 角色 → 权限 | 大多数后台管理系统 |
| ABAC / 资源级 | 根据资源属性判断，如"只能改自己的文章" | 需要细粒度控制 |

- 只做角色检查不够："角色允许编辑文章"和"该用户能编辑这篇文章"是两回事。
- 忽略资源归属校验会造成越权漏洞（IDOR）：改 URL 里的 `id` 就能访问别人的数据。
- 资源归属校验放在 Service 中，查询时把"归属条件"写进 `where`，例如 `where: { id, ownerId: operator.id }`。

## 五、配置、校验、日志、文档

### 1. 配置管理

```ts
ConfigModule.forRoot({
  isGlobal: true,
  validate: config => envSchema.parse(config),
})
```

- **启动时校验环境变量（fail fast）：** 缺失或格式错误直接启动失败，而不是运行到一半才暴露。
  - 部署时容器启动失败，编排系统不会把流量切到新版本，旧版本继续服务；运行时才发现则用户已经受影响。
  - 避免漏配关键变量后静默回落到弱默认值（如 `JWT_SECRET`）。
  - 校验后得到有类型的配置对象。
- 配置校验检查的是配置本身；连通性由 `onModuleInit` 的 `$connect()` 和健康检查负责。
- `.env` 不提交仓库，提供 `.env.example`。
- 密钥不写入镜像，通过环境变量或密钥管理服务注入。
- 使用 `ConfigService` 读取，不散落地写 `process.env`。

### 2. 参数校验与业务校验

**Pipe 是机制，校验和转换都是它的职责：**

```text
Pipe
 ├─ 转换：ParseIntPipe（"123" → 123）、ParseUUIDPipe
 └─ 校验：ValidationPipe（class-validator）、Zod Pipe（schema）
```

Schema/DTO 是校验规则的来源，由 Pipe 执行。

**输入校验与业务校验的分工：**

| | 输入校验（Pipe + Schema） | 业务校验（Service） |
|---|---|---|
| 依据 | 请求数据本身 | 请求数据加系统当前状态 |
| 是否需要查库 | 不需要 | 通常需要 |
| 失败状态码 | `400` | `404` / `409` / `403` / `422` 等 |
| 例子 | 用户名长度、邮箱格式、枚举值、分页范围 | 用户名是否被占用、角色是否存在、有无权限、余额是否足够 |

判断标准：不访问数据库或其他系统状态就能判断的，放 Schema/Pipe；否则放 Service。

- 输入校验在最外层尽早拒绝，Service 可以信任拿到的数据类型。
- 业务校验依赖系统状态，要考虑并发，唯一性最终靠数据库唯一索引保证。
- 所有来自客户端的数据都不可信，边界处统一校验。

### 3. 日志

**输出方式：**

```text
应用 (pino) → stdout → 容器运行时 → 日志采集器 → 集中存储 → 查询/告警
                                    (Promtail / Fluent Bit / Vector)  (Loki / ELK / 云日志)
```

- 应用只输出结构化 JSON 到 stdout，收集和存储交给基础设施。
  - 容器是临时的，本地文件会随容器丢失。
  - 多实例日志分散，无法统一查询。
  - 自己写文件要处理切割、轮转、磁盘写满等问题。
- 没有容器和日志平台、单机部署时才写文件：用 `pino-roll` 或 `logrotate` 做轮转与保留期。

**请求日志的分层：**

| 类型 | 记录内容 | 策略 |
|---|---|---|
| 访问日志 | 方法、路径、状态码、耗时、请求 ID、用户 ID | 每请求一行，体积小，通常全量 |
| 错误日志 | 异常信息、堆栈、请求上下文 | 全量，`5xx` 触发告警 |
| 审计日志 | 登录、改密码、删除、权限变更等 | 单独存储，长期保留 |
| 请求/响应体 | Body 内容 | 默认不记录，按需开启 |

**控制日志量：**

1. 只记录摘要，不记录 Body。
2. 生产默认 `info`，需要排查时临时调高。
3. 忽略健康检查等噪音请求。
4. 对高频低价值的成功请求采样，错误保持全量。
5. 用 `redact` 脱敏。
6. 分级保留：热数据 7 到 14 天，冷数据归档，审计日志更久。
7. 用请求 ID 串联同一请求的日志。

```ts
LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    autoLogging: { ignore: req => req.url === '/health' },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
      censor: '[REDACTED]',
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
  },
})
```

**追溯能力：** 请求 ID（写入响应头、日志、错误响应）、用户 ID、独立的审计日志。

**日志中不应出现敏感信息：**

- 密码在传输时靠 HTTPS 加密；服务端接收到的就是明文，所以必须由服务端自己保证不记录。不要靠前端加密来规避。
- 明文密码可能进入日志的环节：
  - 请求日志记录了 `req.body`。
  - 异常日志带了请求对象。
  - 校验错误信息包含了字段原值。
  - 直接打印 DTO 或对象。
  - Prisma `query` 日志含参数。
  - 密码或令牌放在 URL 查询参数里。
  - Sentry 等外部监控捕获了请求体。
  - 调试用的 `console.log` 遗留。
- 发现后的处理：先止血（去掉输出并发布），清理已产生的日志及转发副本，视为凭据泄露，通知用户重置密码。
- 预防：`redact` 脱敏、白名单记录字段、默认不记录 Body、禁止打印整个 DTO、ESLint 限制 `console.log`、写测试断言日志不含密码。

### 4. 接口文档

- **OpenAPI** 是描述 HTTP 接口的规范（JSON/YAML）；**Swagger UI** 是把它渲染成网页的工具；`@nestjs/swagger` 根据 Controller 和 DTO 自动生成 OpenAPI。
- Apifox 负责文档管理、调试、Mock、测试，并能导入 OpenAPI，与代码生成是互补关系。

| 方式 | 风险 |
|---|---|
| 在 Apifox 手工维护 | 代码变更后文档不同步，逐渐失真 |
| 代码生成 OpenAPI 后导入 Apifox | 文档与代码同步，准确 |

```text
Controller + DTO → 自动生成 openapi.json → Apifox 导入/定时同步 → 联调、Mock、测试
                                        → openapi-typescript / orval 生成前端类型与请求代码
```

- 接口少、个人项目可以手工维护；团队协作、变更频繁建议自动生成。
- 使用 Zod 时可搭配 `nestjs-zod` 把 schema 转为 OpenAPI，避免重复写装饰器。
- 生产环境关闭 Swagger UI 或加鉴权；导出 `openapi.json` 可放在 CI 中完成。

### 5. 其他安全与稳定性配置

| 能力 | 做法 |
|---|---|
| 限流 | `@nestjs/throttler`，登录等敏感接口更严格 |
| 安全响应头 | `helmet` |
| 跨域 | 显式配置白名单，生产不使用 `origin: '*'` 加携带凭证 |
| 健康检查 | `@nestjs/terminus`，供容器编排探测 |


## 六、工程化与部署

### 1. Dockerfile 多阶段构建

```dockerfile
# ---- 构建阶段 ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- 运行阶段 ----
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# 使用 Prisma 时还需拷贝生成的客户端，以实际生成路径为准
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

- **多阶段构建** 缩小最终镜像：运行镜像不含源码、TypeScript、开发依赖，体积小、攻击面小。
- **层缓存** 加快构建：Docker 按层缓存，某层失效则其后所有层重新执行。`package*.json` 很少变、源码常变，所以先装依赖再拷源码，改代码不会重新安装依赖。
- 多阶段与层缓存是两件事：前者管体积，后者管速度。
- `npm ci` 按锁文件安装，结果可复现；`--omit=dev` 代替已弃用的 `--production`。
- 不以 root 运行；配合 `.dockerignore` 排除 `node_modules`、`.env`、`.git`。

### 2. 优雅停机

```ts
app.enableShutdownHooks()
```

**信号流程：**

```text
1. 向容器 1 号进程发送 SIGTERM（请求优雅退出）
2. 等待宽限期（Docker 默认 10 秒）
3. 超时未退出 → SIGKILL 强制杀死，没有清理机会
```

- `enableShutdownHooks()` 让 Nest 监听 `SIGTERM`，触发 `onModuleDestroy` 等钩子（完成在途请求、断开数据库连接）。
- 前提是 Node 进程真的收到 `SIGTERM`。

**启动命令的影响：**

```text
CMD ["node", "dist/main.js"]      Node 是 1 号进程，直接收到信号 ✅
CMD ["npm", "run", "start:prod"]  1 号进程是 npm，不一定转发信号给子进程 ❌
```

- 信号没送到 Node 时：钩子不触发，等满宽限期后被强杀；在途请求被中断，数据库连接不正常关闭，发布变慢。
- 首选 `CMD ["node", "dist/main.js"]`，使用数组（exec）格式；字符串格式会经过 shell，同样可能吞掉信号。
- 必须用 npm 脚本时，用 `docker run --init` 或 `tini` 转发信号。
- 验证：`docker stop` 后观察是否很快退出，还是卡满 10 秒。
- 编排系统的宽限期要大于最长请求耗时。

### 3. 健康检查

| 探针 | 失败后动作 | 应该检查 | 不应该检查 |
|---|---|---|---|
| 存活 liveness | 重启容器 | 进程自身是否卡死（能响应最小 health 请求） | 外部依赖 |
| 就绪 readiness | 摘除流量，不重启 | 必需依赖（数据库、Redis）的轻量连通性，如 `SELECT 1`、`PING` | 非关键、可降级的依赖 |
| 启动 startup | 启动期间暂缓其他探针 | 应用是否完成初始化 | |

- 存活探针不检查数据库的原因是**避免故障放大**：数据库故障 → 所有实例存活探针失败 → 全部被重启 → 重启后大量连接涌入数据库 → 数据库更难恢复。重启应用并不能修复数据库。
- 判断原则：重启能解决的问题放存活探针，不能解决的放就绪探针。
- 就绪探针只做轻量连通检查，不做业务读写。
- 非关键依赖（如仅作缓存的 Redis）故障应降级，不应导致所有实例被摘流量。
- 使用 `@nestjs/terminus` 实现。

### 4. 数据库迁移的发布流程

- 生产使用 `prisma migrate deploy`，不使用 `migrate dev`（可能重置数据）。
- 迁移作为独立步骤在发布前执行，避免多个实例启动时同时迁移。
- 破坏性变更分多次发布（expand/contract）：先加新列并兼容读写，再迁移数据，最后删除旧列。

## 七、AI 场景

### 1. 流式输出：SSE

| | SSE | WebSocket |
|---|---|---|
| 方向 | 服务端 → 客户端单向 | 双向 |
| 协议 | 普通 HTTP | 独立协议升级 |
| 自动重连 | 浏览器内置 | 需自己实现 |
| 适用 | LLM 流式回复、进度推送 | 聊天室、协同编辑 |

```ts
@SkipResponseWrap()
@Sse('chat')
chat(@Query('q') q: string): Observable<MessageEvent> {
  return from(this.aiService.stream(q)).pipe(
    map(chunk => ({ data: chunk }) as MessageEvent),
  )
}
```

- 原生 `EventSource` 只支持 GET，且不能自定义请求头。需要 POST 或带 `Authorization` 时，前端用 `fetch` 读流或 `@microsoft/fetch-event-source`。这是前端限制，与 Interceptor 无关。
- **统一响应 Interceptor 必须跳过流式接口：** `map` 假设返回值是一次性的完整结果，对流会把每个片段都包成 `{ code, data }`，破坏 SSE 协议格式。
  - 用 `@SkipResponseWrap()` 加 `Reflector` 判断，命中则直接 `return next.handle()`。
  - 文件下载同理。
- Nginx 等反向代理要关闭缓冲（`proxy_buffering off`），否则前端收不到流。

### 2. 客户端断开时取消上游

- 用户关闭页面时浏览器已断开连接，后端不需要"通知"，而是要**感知断开并停止上游工作**。
- 不处理的话，LLM 调用会继续生成到结束，白白消耗 token 和费用，并占用连接与内存。

```ts
const controller = new AbortController()
req.on('close', () => controller.abort())
this.aiService.stream(q, { signal: controller.signal })
```

- 用 `req.on('close')` 感知断开，用 `AbortController` 传递取消信号；LangChain 的 `stream` 支持 `signal`。
- 返回 Observable 时，客户端断开会取消订阅，可在 teardown 中 `abort`。
- 彻底释放 LLM 请求、数据库连接等资源。
- 业务上决定已生成内容是否保存，通常保存并标记为"已中断"。

### 3. LLM 调用的稳定性

- 超时：必须设置。
- 重试：对 `429` 和网络错误做指数退避，参数错误不重试。
- 限流：按用户限制频率，防止账单暴涨。
- 成本控制：记录 token 用量，设置用户配额。
- 密钥只在服务端，不下发前端。

### 4. 缓存与队列

- Redis 缓存：相同问题和参数的结果；Embedding 结果缓存可节省大量费用。
- 耗时任务（文档解析、向量化）放队列（BullMQ）异步处理，不在请求中同步执行。
- 队列任务必须幂等，因为重试可能导致重复执行。

### 5. 大文档向量化的设计

**处理流程：** 先解析成文本，再按语义切分，不是对二进制按字节切分。

```text
文件 → 解析文本 → 按段落/语义切分 chunk（带 overlap）→ 分批 embedding → 写入向量库
```

**为什么不能在请求中同步处理：**

| 问题 | 说明 |
|---|---|
| 耗时极长 | 解析加数千次 embedding，远超网关超时 |
| 占用连接 | 并发稍高就耗尽 |
| 失败无法恢复 | 中途失败或重启，进度全丢 |
| 无法控制速率 | 突发调用触发供应商 `429` |
| 体验差 | 前端无进度 |

**推荐设计：**

```text
1. 上传：文件直传对象存储（预签名 URL），不经过应用服务器
2. 创建任务：数据库记录 document（pending），队列只投递文件 ID
3. 立即返回 documentId（HTTP 202）
4. Worker 异步处理：下载 → 解析 → 切分 → 分批 embedding（控制并发）→ 批量写向量库，更新状态与进度
5. 前端轮询状态接口，或通过 SSE/WebSocket 获取进度
```

- 状态机：`pending → processing → done / failed`。
- 幂等：用 `documentId + chunkIndex` 作为向量主键，重复写入变成覆盖。
- 失败重试带指数退避，超过次数标记失败并保留原因。
- embedding 分批发送并限制并发，避免限流。
- 记录已完成 chunk，支持断点续传。
- 队列放引用，不放大内容。
- 限制上传大小与类型。
- Worker 可独立部署、独立扩缩容。

### 6. RAG 的后端要点

- **权限过滤：** 检索时必须带 `userId` / `tenantId` 条件，否则会检索到他人文档，这是常见越权漏洞。
- **提示注入：** 检索到的文档和用户输入都不可信，不能让它们改变系统指令或触发越权操作。
- **有状态流程（如 LangGraph）：** 状态按会话隔离，不放在单例 Service 的实例属性中（同阶段 1 的请求状态问题）。
