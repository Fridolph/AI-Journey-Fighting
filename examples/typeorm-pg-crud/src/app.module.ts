import 'dotenv/config';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsModule } from './conversations/conversations.module';
import { PrismaConversationsModule } from './prisma-conversations/prisma-conversations.module';
import { User } from './conversations/entities/user.entity';
import { Conversation } from './conversations/entities/conversation.entity';
import { Message } from './conversations/entities/message.entity';

/**
 * 应用根模块
 *
 * @remarks
 * 负责两件事：**建立数据库连接** + **挂载业务模块**。
 *
 * ## 数据库连接（TypeOrmModule.forRoot）
 *
 * | 配置 | 作用 |
 * |------|------|
 * | `type: 'postgres'` | 驱动类型 |
 * | `url: process.env.DATABASE_URL` | 连接串（与 Prisma 版共用同一个来源） |
 * | `entities` | 注册实体类，TypeORM 据此识别表和关系 |
 * | `synchronize: true` | **启动时自动同步表结构**（见下方警告） |
 * | `logging: true` | 打印实际执行的 SQL —— 学习/调试期非常有用 |
 *
 * > **关于连接配置**：这里用 `url: DATABASE_URL` 而非分字段配置
 * > （host/port/username/password/database），原因是：
 * > 1. 与 Prisma 版（`prisma.config.ts` 也读 DATABASE_URL）保持**同一个数据源**，
 * >    两个 ORM 才能对照查询同一份数据
 * > 2. 敏感信息集中在 `.env`，不散落在代码里
 *
 * > ⚠️ `synchronize: true` 只适用于开发环境：
 * > 它会根据实体定义自动 ALTER 表，**生产环境有丢失数据的风险**。
 * > 正式项目应改为 migration 管理表结构。
 *
 * ## 模块挂载
 *
 * 两个模块共用同一个 PostgreSQL 连接，互不影响：
 * - `ConversationsModule` —— TypeORM 版（`/conversations/*`）
 * - `PrismaConversationsModule` —— Prisma + Zod 版（`/prisma-conversations/*`）
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      synchronize: true,
      logging: true,
      entities: [User, Conversation, Message],
    }),
    ConversationsModule,
    PrismaConversationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
