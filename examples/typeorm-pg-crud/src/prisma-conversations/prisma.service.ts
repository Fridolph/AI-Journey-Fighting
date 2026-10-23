/**
 * PrismaService —— PrismaClient 的 NestJS 封装
 *
 * @remarks
 * 对照 TypeORM 版：本目录没有对应文件，因为 TypeORM 的连接是通过
 * `TypeOrmModule.forRoot()`（见 {@link AppModule}）统一建立、由框架托管；
 * 而 Prisma 需要自己管理 client 实例，所以单独包一个 Service。
 *
 * **为什么要 extends 而不是包装成属性？**
 * 继承后 `this.prisma.user.findMany(...)` 可以直接写在本类上，
 * 注入方（业务 Service）拿到的对象就有了全部 Prisma 方法，少一层 `.client` 转发。
 * 这是 Prisma 官方 NestJS 示例的推荐写法。
 *
 * **为什么实现 OnModuleInit / OnModuleDestroy？**
 * - `onModuleInit` → `$connect()`：模块初始化时建立连接池，
 *   避免首次请求时才连接（冷启动延迟会被算进第一个用户的响应时间）
 * - `onModuleDestroy` → `$disconnect()`：应用关闭时释放连接，
 *   防止进程退出后连接泄漏（尤其是热重载频繁的开发环境）
 *
 * ## ⚠️ Prisma 7 的重要变化：必须使用 Driver Adapter
 *
 * Prisma 7 起**不再内置数据库驱动**，需要显式传入 adapter
 * （否则启动时报 `PrismaClient was instantiated without any options`）。
 *
 * ```text
 * Prisma 6 及以前：  new PrismaClient()             → 内部自带 pg 驱动
 * Prisma 7 及以后：  new PrismaClient({ adapter })  → 由 adapter 提供连接
 * ```
 *
 * 这样做的收益：连接复用同一个 `pg` 连接池，配置风格与项目里其他
 * 直接用 `pg` 的代码（如 `examples/pgsql-test`）保持一致，
 * 也避免了 Prisma 自带驱动与项目驱动版本冲突。
 *
 * 对照 pgsql-test 的 `db.mjs`：那里手动 `new Pool()` + 导出 query 函数；
 * 这里把连接池交给 adapter，再由 NestJS 的模块生命周期托管。
 */
import 'dotenv/config';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * 用 pg 驱动构建 Prisma 适配器
 *
 * @remarks
 * `PrismaPg` 接收的配置与 `pg.Pool` 的配置同源——
 * 所以这里直接复用 `.env` 里的 `DATABASE_URL` 连接串，
 * 和 TypeORM 版指向同一个数据库。
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // 把 adapter 交给 PrismaClient —— 这是 Prisma 7 建立连接的唯一方式
    super({ adapter });
  }

  /** 模块启动时连接数据库 */
  async onModuleInit() {
    await this.$connect();
  }

  /** 模块销毁（应用关闭）时断开连接 */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
