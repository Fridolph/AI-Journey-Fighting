/**
 * PrismaConversationsController —— Prisma + Zod 版三个接口
 *
 * @remarks
 * 与 TypeORM 版（`../conversations/conversations.controller.ts`）对照：
 *
 * | | TypeORM 版 | 本文件 |
 * |--|-----------|--------|
 * | 路径前缀 | `conversations` | `prisma-conversations` |
 * | 注入的 Service | ConversationsService | PrismaConversationsService |
 * | 请求体校验 | 无（裸 DTO） | **Zod 管道** |
 *
 * 三个路由一一对应，方便直接对比两种 ORM 的写法差异。
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
import { semanticSearchSchema } from './dto/semantic-search.dto';
// 注意：SemanticSearchDto 是用 z.infer 推导出的**纯类型**，
// 在开启 isolatedModules + emitDecoratorMetadata 时，
// 装饰器签名里引用的类型必须用 `import type` 单独引入，
// 否则 TS 会报 TS1272（运行时无法为它生成元数据）。
import type { SemanticSearchDto } from './dto/semantic-search.dto';
import { ZodValidationPipe } from './dto/zod-validation.pipe';

@Controller('prisma-conversations')
export class PrismaConversationsController {
  constructor(
    private readonly conversationsService: PrismaConversationsService,
  ) {}

  /**
   * GET `/prisma-conversations/users/:userId` —— 用户的会话列表
   *
   * @param userId - 路径参数（ParseIntPipe 转数字并校验）
   */
  @Get('users/:userId')
  findByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.conversationsService.findConversationsByUserId(userId);
  }

  /**
   * GET `/prisma-conversations/:id/messages` —— 会话的消息列表
   *
   * @param id - 会话 ID（路径参数）
   */
  @Get(':id/messages')
  findMessages(@Param('id', ParseIntPipe) id: number) {
    return this.conversationsService.findMessagesByConversationId(id);
  }

  /**
   * POST `/prisma-conversations/:id/search` —— 会话内语义检索
   *
   * @param id - 会话 ID（路径参数）
   * @param dto - 请求体，经 **Zod 管道**校验后的数据
   * @param queryLimit - 查询串 `?limit=`，作为 limit 的备用来源
   *
   * @remarks
   * **这里和 TypeORM 版唯一的写法差异在 `@Body` 上**：
   *
   * ```ts
   * // TypeORM 版：裸 DTO，无运行时校验
   * @Body() dto: SemanticSearchDto
   *
   * // 本文件：套一层 Zod 管道，非法请求直接 400
   * @Body(new ZodValidationPipe(semanticSearchSchema)) dto: SemanticSearchDto
   * ```
   *
   * 注意：`@Body` 里的 Pipe **只作用于请求体**，路径参数和查询串
   * 由各自的 `ParseIntPipe` 负责——每个参数位可以挂不同的管道。
   *
   * 另外一个细节：`dto.query` 现在一定能通过类型检查，
   * 因为它已经过 Zod 校验（`query` 必填且非空）。
   */
  @Post(':id/search')
  search(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(semanticSearchSchema))
    dto: SemanticSearchDto,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) queryLimit?: number,
  ) {
    const limit = dto.limit ?? queryLimit ?? 5;
    return this.conversationsService.searchSimilarMessages(
      id,
      dto.query,
      limit,
    );
  }
}
