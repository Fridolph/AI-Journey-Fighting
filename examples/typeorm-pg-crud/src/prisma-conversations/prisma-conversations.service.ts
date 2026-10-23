/**
 * PrismaConversationsService —— Prisma 版业务逻辑
 *
 * @remarks
 * 与 TypeORM 版（`../conversations/conversations.service.ts`）**一一对应**：
 *
 * | 方法 | TypeORM 实现 | Prisma 实现 |
 * |------|-------------|------------|
 * | findConversationsByUserId | `em.findOne(User, { relations })` | `prisma.user.findUnique({ include })` |
 * | findMessagesByConversationId | `em.findOne(Conversation, { relations })` | `prisma.conversation.findUnique({ include })` |
 * | searchSimilarMessages | `em.query(原生 SQL)` | `prisma.$queryRawUnsafe(原生 SQL)` |
 *
 * 三个方法都能看出同一件事：**ORM 负责普通关系查询，扩展语法必须写原生 SQL。**
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PrismaService } from './prisma.service';

/**
 * 语义检索返回结构
 *
 * @remarks
 * 与 TypeORM 版的 `SemanticSearchResult` 完全一致——字段用蛇形命名，
 * 因为原生 SQL 返回的就是数据库列名，不做驼峰转换。
 */
export interface SemanticSearchResult {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  created_at: Date;
  similarity: number;
}

@Injectable()
export class PrismaConversationsService {
  /** embedding 模型懒加载缓存 */
  private embeddings: OpenAIEmbeddings | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 查询某用户的全部会话（用户 → 会话）
   *
   * @param userId - 用户 ID
   * @returns 用户对象，`conversations` 已按创建时间倒序填充
   * @throws NotFoundException 用户不存在时抛出 404
   *
   * @remarks
   * ✅ **完整示范** —— 请重点对照 TypeORM 的写法：
   *
   * ```ts
   * // TypeORM 版
   * this.em.findOne(User, {
   *   where: { id: userId },
   *   relations: { conversations: true },        // ← 关联加载
   *   order: { conversations: { createdAt: 'DESC' } },
   * })
   *
   * // Prisma 版（本方法）
   * this.prisma.user.findUnique({
   *   where: { id: userId },
   *   include: { conversations: { orderBy: { createdAt: 'desc' } } },  // ← 关联加载
   * })
   * ```
   *
   * **三点关键差异**：
   * 1. `relations` ↔ `include`：语义相同，都是「把关联表的数据一起查出来」
   * 2. 排序位置：TypeORM 把嵌套排序放在外层 `order`，
   *    Prisma 放在 `include` 内部的 `orderBy`（更直观）
   * 3. 排序值写法：TypeORM 用 `'DESC'`（大写），Prisma 用 `'desc'`（小写）
   *
   * `findUnique` 找不到时返回 `null`（不抛异常），所以要自己判断并抛 404。
   */
  async findConversationsByUserId(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        conversations: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!user) {
      throw new NotFoundException(`User #${userId} not found`);
    }

    return user;
  }

  /**
   * 查询某会话的全部消息（会话 → 消息）
   *
   * @param conversationId - 会话 ID
   * @returns 会话信息 + 消息数组（按时间正序）
   * @throws NotFoundException 会话不存在时抛出 404
   *
   * @remarks
   * ★ **你来填 ③** —— 照抄上面 `findConversationsByUserId` 的结构：
   *
   * 1. `this.prisma.conversation.findUnique({ ... })`
   * 2. `where: { id: conversationId }`
   * 3. `include: { messages: { orderBy: { createdAt: 'asc' } } }`
   *    （注意是 `asc`，聊天记录正序；对照 TypeORM 的 `'ASC'`）
   * 4. 不存在则抛 `NotFoundException(\`Conversation #${conversationId} not found\`)`
   *
   * **需要额外思考的一点**：TypeORM 版这里是**手动挑字段**返回的
   * （因为消息实体的 `embedding` 字段有 1024 维，不该返回给前端）。
   * Prisma 的 `Unsupported("vector(1024)")` 类型默认**不会**被查出来，
   * 所以结构天然就是干净的——这也算用 Unsupported 的一个附带好处。
   */
  async findMessagesByConversationId(conversationId: number) {
    // ★ 你来填 ③
    throw new Error('TODO: 你来填 ③');
  }

  /**
   * 会话内语义检索（pgvector 余弦距离）
   *
   * @param conversationId - 检索范围限定的会话 ID
   * @param searchText - 自然语言搜索词
   * @param limit - 返回条数上限，默认 5
   * @returns 按相似度倒序的消息列表
   * @throws NotFoundException 会话不存在时抛出 404
   *
   * @remarks
   * ★ **你来填 ④** —— 第一步（校验会话）和第二步（向量化）已给出，
   * 你只需要补**第三步：执行原生 SQL**。
   *
   * 提示：Prisma 执行原生 SQL 用 `$queryRawUnsafe`，写法是
   * ```ts
   * await this.prisma.$queryRawUnsafe(`...SQL...`, 参数1, 参数2, 参数3)
   * ```
   *
   * **SQL 和 TypeORM 版完全一样**（可以对照 `conversations.service.ts` 抄）：
   * ```sql
   * SELECT id, conversation_id, role, content, created_at,
   *        1 - (embedding <=> $1::vector) AS similarity
   * FROM messages
   * WHERE conversation_id = $2 AND embedding IS NOT NULL
   * ORDER BY embedding <=> $1::vector
   * LIMIT $3
   * ```
   * 参数顺序：`JSON.stringify(vector)`、`conversationId`、`limit`
   *
   * **返回值处理**：类型标注为 `SemanticSearchResult[]`，
   * 并把 `similarity` 从 string 转成 number（pg 的 numeric 经驱动是字符串）。
   *
   * **想清楚这个问题**：TypeORM 和 Prisma 都是成熟的 ORM，
   * 为什么两者在这件事上都必须退回原生 SQL？
   * （答案：`<=>` 是 pgvector 扩展引入的操作符，不在任何 ORM 的抽象范围内）
   */
  async searchSimilarMessages(
    conversationId: number,
    searchText: string,
    limit = 5,
  ): Promise<SemanticSearchResult[]> {
    // ① 校验会话存在（已给出）
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation #${conversationId} not found`);
    }

    // ② 搜索词向量化（已给出）
    const vector = await this.embedQuery(searchText);

    // ★ 你来填 ④：执行原生 SQL 并处理返回值

    throw new Error('TODO: 你来填 ④');
  }

  // ──────────────────────────────────────────────────────────
  // 以下为 embedding 工具方法（与 TypeORM 版完全一致，已给出）
  // ──────────────────────────────────────────────────────────

  /**
   * 获取（懒加载）embedding 模型实例
   *
   * @returns OpenAIEmbeddings 实例
   * @throws BadRequestException 未配置任何 API Key 时抛出 400
   *
   * @remarks
   * 环境变量读取顺序：优先 `EMBEDDINGS_*`（专用向量服务），
   * 回退到 `OPENAI_*`（通用对话服务）——两者可以是不同厂商，
   * 只要 API 兼容 OpenAI 协议。
   *
   * 先做一次配置检查，是为了把「缺少配置」这类问题在入口处暴露成
   * 明确的 400，而不是等 embedding API 调用失败后抛出一个难懂的 SDK 错误。
   */
  private getEmbeddings(): OpenAIEmbeddings {
    if (!this.embeddings) {
      const apiKey =
        process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new BadRequestException(
          '语义检索需要配置 EMBEDDINGS_API_KEY 或 OPENAI_API_KEY',
        );
      }
      this.embeddings = new OpenAIEmbeddings({
        model: process.env.EMBEDDING_MODEL || 'text-embedding-v3',
        apiKey,
        configuration: {
          baseURL: process.env.EMBEDDINGS_URL || process.env.OPENAI_BASE_URL,
        },
      });
    }
    return this.embeddings;
  }

  /**
   * 把一段文本转成向量
   *
   * @param text - 待向量化的文本
   * @returns 1024 维浮点数组
   */
  private async embedQuery(text: string): Promise<number[]> {
    return this.getEmbeddings().embedQuery(text);
  }
}
