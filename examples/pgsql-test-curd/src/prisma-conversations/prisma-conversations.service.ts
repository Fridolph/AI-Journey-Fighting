/**
 * PrismaConversationsService — Prisma 版业务逻辑
 *
 * 对照参考：src/conversations/conversations.service.ts（TypeORM 版）
 *
 * 填写规则：
 *   标有「★ 你来填」的地方是关键知识点，其他都是模板代码。
 *   第一个方法（③-A）已完整写好作为示范。
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PrismaService } from './prisma.service';

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
  private embeddings: OpenAIEmbeddings | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** 用户 → 会话（一对多）—— ✅ 完整示范 */
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

  /** 会话 → 消息（一对多） */
  async findMessagesByConversationId(conversationId: number) {
    // ★ 你来填 3：仿照上面的 findConversationsByUserId
    //   提示：
    //     1. this.prisma.conversation.findUnique({ ... })
    //     2. where: { id: conversationId }
    //     3. include: { messages: { orderBy: { createdAt: 'asc' } } }
    //     4. 会话不存在抛 NotFoundException(`Conversation #${conversationId} not found`)
    //   对照 TypeORM：relations: { messages: true } + order: { messages: { createdAt: 'ASC' } }
    throw new Error('TODO: 你来填 3');
  }

  /** 会话内语义检索（pgvector 余弦距离）—— 原生 SQL 绕不开 */
  async searchSimilarMessages(
    conversationId: number,
    searchText: string,
    limit = 5,
  ): Promise<SemanticSearchResult[]> {
    // 确认会话存在（模板已写好）
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation #${conversationId} not found`);
    }

    // 向量化搜索文本（模板已写好）
    const vector = await this.embedQuery(searchText);

    // ★ 你来填 4：$queryRawUnsafe 原生 SQL
    //   提示：
    //     1. await this.prisma.$queryRawUnsafe(`...SQL...`, 参数1, 参数2, 参数3)
    //     2. SQL 和 TypeORM 版 em.query 的完全一样（<=> 是 pgvector 扩展操作符）：
    //        SELECT id, conversation_id, role, content, created_at,
    //               1 - (embedding <=> $1::vector) AS similarity
    //        FROM messages
    //        WHERE conversation_id = $2 AND embedding IS NOT NULL
    //        ORDER BY embedding <=> $1::vector
    //        LIMIT $3
    //     3. 参数顺序：[JSON.stringify(vector), conversationId, limit]
    //     4. 返回的 rows 里 similarity 是 string，需要 map 成 number
    //   对照 TypeORM：em.query(sql, [JSON.stringify(vector), conversationId, limit])
    //   思考题：为什么 TypeORM 和 Prisma 都要回到原生 SQL？—— 因为 <=> 不在任何 ORM 的抽象层内
    throw new Error('TODO: 你来填 4');
  }

  // —— 以下私有方法（embedding 工具）已完整写好 ——

  private getEmbeddings(): OpenAIEmbeddings {
    if (!this.embeddings) {
      this.embeddings = new OpenAIEmbeddings({
        model: process.env.EMBEDDING_MODEL || 'text-embedding-v3',
        apiKey: process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY,
        configuration: {
          baseURL: process.env.EMBEDDINGS_URL || process.env.OPENAI_BASE_URL,
        },
      });
    }
    return this.embeddings;
  }

  private async embedQuery(text: string): Promise<number[]> {
    return this.getEmbeddings().embedQuery(text);
  }
}
