/**
 * PrismaConversationsModule — Prisma 版模块
 *
 * 对照参考：src/conversations/conversations.module.ts（TypeORM 版）
 *   TypeORM 版用 TypeOrmModule.forFeature([...]) 提供 Repository
 *   Prisma 版不需要 forFeature，把 PrismaService 声明为 provider 即可
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
