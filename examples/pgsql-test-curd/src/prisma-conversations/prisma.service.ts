/**
 * PrismaService — PrismaClient 的 NestJS 封装
 *
 * 对照参考：examples/pgsql-test/src/db.mjs（pg Pool 模式）
 *   pg 用 Pool 管理连接 → Prisma 用 PrismaClient 单例
 *   pg 手动 query() → Prisma 的 this.user.findUnique() 等方法
 *
 * 这是基础设施样板，直接照抄即可（Prisma 官方推荐写法）。
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
