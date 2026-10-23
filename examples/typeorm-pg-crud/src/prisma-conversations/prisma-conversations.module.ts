/**
 * PrismaConversationsModule —— Prisma + Zod 版功能模块
 *
 * @remarks
 * 对照 TypeORM 版的 `conversations.module.ts`：
 *
 * ```ts
 * // TypeORM 版（如果改用 Repository 注入的话会是这样）
 * @Module({
 *   imports: [TypeOrmModule.forFeature([User, Conversation, Message])],
 *   providers: [ConversationsService],
 * })
 *
 * // Prisma 版（本文件）
 * @Module({
 *   providers: [PrismaService, PrismaConversationsService],   // ← 无需 forFeature
 * })
 * ```
 *
 * **为什么 Prisma 不需要 `forFeature`？**
 * `forFeature` 的作用是把「某个实体的 Repository」注册到当前模块的 DI 容器里。
 * Prisma 不使用 Repository 模式——所有表都由同一个 `PrismaClient` 实例访问
 * （`prisma.user`、`prisma.conversation`… 都是 client 的属性）。
 * 所以只要把 `PrismaService` 声明为 provider，注入方就能拿到全部表的访问能力。
 *
 * `exports: [PrismaService]` 让别的模块也能注入它——
 * 后续如果有别的 Prisma 模块，共用同一个 client 实例（单例）。
 */
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaConversationsService } from './prisma-conversations.service';
import { PrismaConversationsController } from './prisma-conversations.controller';

@Module({
  providers: [PrismaService, PrismaConversationsService],
  controllers: [PrismaConversationsController],
  exports: [PrismaService],
})
export class PrismaConversationsModule {}
