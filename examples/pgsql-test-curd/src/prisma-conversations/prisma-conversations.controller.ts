/**
 * PrismaConversationsController — Prisma 版三个接口
 *
 * 对照参考：src/conversations/conversations.controller.ts（TypeORM 版）
 *
 * 这个文件没有填空点 —— 因为它和 TypeORM 版几乎一模一样，
 * 只是注入的 service 换了 + 路径前缀换了。
 * 你已经写过 TypeORM 版 controller，这里直接给你完整版对照。
 */
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { PrismaConversationsService } from './prisma-conversations.service';
import { SemanticSearchDto } from '../conversations/dto/semantic-search.dto';

@Controller('prisma-conversations')
export class PrismaConversationsController {
  constructor(
    private readonly conversationsService: PrismaConversationsService,
  ) {}

  /** GET /prisma-conversations/users/:userId — 用户的会话列表 */
  @Get('users/:userId')
  findByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.conversationsService.findConversationsByUserId(userId);
  }

  /** GET /prisma-conversations/:id/messages — 会话的消息列表 */
  @Get(':id/messages')
  findMessages(@Param('id', ParseIntPipe) id: number) {
    return this.conversationsService.findMessagesByConversationId(id);
  }

  /** POST /prisma-conversations/:id/search — 会话内语义检索 */
  @Post(':id/search')
  search(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SemanticSearchDto,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) queryLimit?: number,
  ) {
    const limit = dto.limit ?? queryLimit ?? 5;
    return this.conversationsService.searchSimilarMessages(id, dto.query, limit);
  }
}
