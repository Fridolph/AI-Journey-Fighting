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
import { ConversationsService } from './conversations.service';
import { SemanticSearchDto } from './dto/semantic-search.dto';

/**
 * 会话接口控制器
 *
 * @remarks
 * 三个接口正好覆盖两类能力：
 *
 * | 方法 | 路由 | 能力 |
 * |------|------|------|
 * | GET | `/conversations/users/:userId` | 关系查询（用户 → 会话） |
 * | GET | `/conversations/:id/messages` | 关系查询（会话 → 消息） |
 * | POST | `/conversations/:id/search` | 向量语义检索 |
 *
 * **分层职责**：Controller 只做「参数解析 + 转发」，不含任何业务逻辑，
 * 真正的查询/检索都下沉到 {@link ConversationsService}。
 */
@Controller('conversations')
export class ConversationsController {
  /** 通过构造函数注入 Service（NestJS 的 DI 机制） */
  constructor(private readonly conversationsService: ConversationsService) {}

  /**
   * GET `/conversations/users/:userId` —— 查询某用户的会话列表
   *
   * @param userId - 路径参数，经 {@link ParseIntPipe} 转成 number
   *
   * @remarks
   * `ParseIntPipe` 做两件事：类型转换 + 校验。
   * 传 `abc` 这类非数字会直接返回 400，不会进到 Service——
   * 这就是「管道（Pipe）」在 NestJS 里的价值：把校验挡在业务逻辑之前。
   */
  @Get('users/:userId')
  findByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.conversationsService.findConversationsByUserId(userId);
  }

  /**
   * GET `/conversations/:id/messages` —— 查询某会话的全部消息
   *
   * @param id - 会话 ID（路径参数）
   */
  @Get(':id/messages')
  findMessages(@Param('id', ParseIntPipe) id: number) {
    return this.conversationsService.findMessagesByConversationId(id);
  }

  /**
   * POST `/conversations/:id/search` —— 会话内语义检索
   *
   * @param id - 会话 ID（路径参数）
   * @param dto - 请求体，含 `query`（必填）与 `limit`（可选）
   * @param queryLimit - 查询串里的 `?limit=`，作为备用来源
   *
   * @remarks
   * **limit 的三级优先级**（`dto.limit ?? queryLimit ?? 5`）：
   * ```text
   * 1. 请求体里的 limit      ← 最高优先级
   * 2. URL 查询串的 ?limit=  ← 次之
   * 3. 代码兜底 5            ← 最低
   * ```
   * 这么做是为了同时兼容两种调用习惯：既支持
   * `POST /search {"query":"...","limit":3}`，也支持
   * `POST /search?limit=3 {"query":"..."}`。
   *
   * `DefaultValuePipe(5)` 保证 `queryLimit` 在缺省时不会是 `undefined`
   * 而是 `5`，避免后续取值出现 `NaN`。
   */
  @Post(':id/search')
  search(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SemanticSearchDto,
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
