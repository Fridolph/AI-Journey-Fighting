import 'dotenv/config';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { OpenAIEmbeddings } from '@langchain/openai';
import { EntityManager } from 'typeorm';
import { User } from './entities/user.entity';
import { Conversation } from './entities/conversation.entity';

/**
 * 语义检索返回的单行结构
 *
 * @remarks
 * 字段名故意用**蛇形**（`conversation_id` / `created_at`），因为这是
 * 原生 SQL 的结果集形状——pg 驱动返回的列名就是数据库列名，
 * 不做驼峰转换（ORM 的实体才会转换）。直接透传给前端，省一层映射。
 */
export interface SemanticSearchResult {
  /** 消息 ID */
  id: number;
  /** 所属会话 ID（SQL 原始列名） */
  conversation_id: number;
  /** 消息角色：user / assistant / system */
  role: string;
  /** 消息正文 */
  content: string;
  /** 创建时间（SQL 原始列名） */
  created_at: Date;
  /**
   * 余弦相似度，范围约 0~1，越大越相似
   *
   * @remarks
   * SQL 里算的是 `1 - (embedding <=> $1::vector)`：
   * `<=>` 是 pgvector 的**余弦距离**（0 表示完全同向），
   * 用 `1 -` 转成「相似度」更符合直觉（1 表示最相似）。
   */
  similarity: number;
}

/**
 * 会话业务服务 —— 关系查询 + 向量语义检索
 *
 * @remarks
 * 本服务演示 PostgreSQL 在 AI 时代的两项核心能力的**组合**：
 *
 * | 方法 | 用到的能力 | 实现方式 |
 * |------|-----------|---------|
 * | {@link findConversationsByUserId} | 一对多关系查询 | ORM `relations`（自动 JOIN） |
 * | {@link findMessagesByConversationId} | 一对多关系查询 | ORM `relations`（自动 JOIN） |
 * | {@link searchSimilarMessages} | 向量语义检索 | **原生 SQL**（`<=>` 操作符） |
 *
 * 关键结论：**ORM 能覆盖普通关系查询，但覆盖不了 pgvector 扩展语法**，
 * 所以真实项目里通常两者混用——这也是 TypeORM 版和 Prisma 版的共同点。
 */
@Injectable()
export class ConversationsService {
  /** embedding 模型懒加载缓存：避免每次请求都重新实例化 */
  private embeddings: OpenAIEmbeddings | null = null;

  /**
   * @param em - TypeORM 的 EntityManager
   *
   * @remarks
   * 这里注入的是 **EntityManager** 而不是 Repository，有两个原因：
   * 1. 需要跨实体操作（User / Conversation / Message 都要用到）
   * 2. 需要 `em.query()` 执行原生 SQL（Repository 没有这个方法）
   *
   * `@InjectEntityManager()` 由 `TypeOrmModule.forRoot()` 提供的连接中拿到实例。
   */
  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {}

  /**
   * 查询某用户的全部会话（用户 → 会话，一对多）
   *
   * @param userId - 用户 ID
   * @returns 用户实体，其 `conversations` 字段已填充会话数组（按创建时间倒序）
   * @throws NotFoundException 用户不存在时抛出 404
   *
   * @remarks
   * **流程**：
   * 1. `em.findOne(User, ...)` 查用户
   * 2. `relations: { conversations: true }` 让 TypeORM 追加一次关联查询，
   *    把该用户的会话一并取回并挂到 `user.conversations` 上
   * 3. `order` 指定「嵌套字段」的排序：`conversations.createdAt DESC`
   *    （最新会话排最前，符合聊天应用左侧列表的交互习惯）
   *
   * **生成的 SQL 大致是**：
   * ```sql
   * SELECT ... FROM users WHERE id = $1;
   * SELECT ... FROM conversations
   *   WHERE user_id = $1 ORDER BY created_at DESC;
   * ```
   * TypeORM 对一对多默认用「两条查询」而非 JOIN，
   * 避免主表字段被关联行撑爆（笛卡尔积）。
   *
   * **业务场景**：用户登录后拉取左侧会话列表。
   */
  async findConversationsByUserId(userId: number) {
    const user = await this.em.findOne(User, {
      where: { id: userId },
      relations: { conversations: true },
      order: { conversations: { createdAt: 'DESC' } },
    });

    if (!user) {
      throw new NotFoundException(`User #${userId} not found`);
    }

    return user;
  }

  /**
   * 查询某会话的全部消息（会话 → 消息，一对多）
   *
   * @param conversationId - 会话 ID
   * @returns 会话信息 + 其下消息数组（按时间正序）
   * @throws NotFoundException 会话不存在时抛出 404
   *
   * @remarks
   * **流程**：
   * 1. 用 `relations: { messages: true }` 一次性取出会话及其消息
   * 2. `order` 按 `messages.createdAt ASC`——聊天记录按时间正序读才自然
   * 3. **手动挑字段返回**：不复用 `conversation` 实体的原始形状，原因有二：
   *    - 实体上的 `messages[].embedding`（1024 维数组）体积巨大，
   *      返回给前端毫无意义，必须剔除
   *    - `conversation.user` 关系字段没查，保持响应体精简、稳定
   *
   * 这类「实体 → DTO」的映射是 ORM 项目的常见实践：
   * **数据库模型（Entity）和接口模型（Response）不该直接划等号。**
   *
   * **业务场景**：点击某个会话，拉取它的完整聊天记录。
   */
  async findMessagesByConversationId(conversationId: number) {
    const conversation = await this.em.findOne(Conversation, {
      where: { id: conversationId },
      relations: { messages: true },
      order: { messages: { createdAt: 'ASC' } },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation #${conversationId} not found`);
    }

    return {
      id: conversation.id,
      userId: conversation.userId,
      title: conversation.title,
      createdAt: conversation.createdAt,
      messages: conversation.messages.map(
        ({ id, conversationId, role, content, createdAt }) => ({
          id,
          conversationId,
          role,
          content,
          createdAt,
        }),
      ),
    };
  }

  /**
   * 会话内语义检索（pgvector 余弦距离）
   *
   * @param conversationId - 限定检索范围的会话 ID
   * @param searchText - 用户输入的搜索词（自然语言）
   * @param limit - 返回条数上限，默认 5
   * @returns 按相似度倒序排列的消息列表
   * @throws NotFoundException 会话不存在时抛出 404
   *
   * @remarks
   * **完整流程（4 步）**：
   *
   * ```text
   * ① 校验会话存在         → 防止跨会话越权检索
   * ② searchText 向量化     → embedQuery() 调 embedding 模型，得到 1024 维数组
   * ③ 执行原生 SQL          → 用 <=> 算余弦距离并排序取 Top K
   * ④ 类型收尾              → similarity 从 string 转成 number
   * ```
   *
   * **为什么必须用原生 SQL？**
   * `<=>` 是 pgvector 扩展引入的操作符，不是标准 SQL。
   * TypeORM 的 QueryBuilder / Repository API 无法表达它，
   * 只能退回 `em.query()` 手写 SQL。
   * （Prisma 版本同样如此——两个 ORM 都绕不开这一点。）
   *
   * **参数化注意**：`$1` 是向量参数，出现两次（SELECT 里算相似度、ORDER BY 里排序），
   * 复用同一个占位符即可，不必传两份。
   * 向量以 `JSON.stringify(vector)` 传入，再由 `$1::vector` 强转为向量类型
   * （pg 驱动不认识 JS 数组，JSON 字符串是通用载体）。
   *
   * **索引命中**：`ORDER BY embedding <=> ... LIMIT n` 会走建表时创建的
   * HNSW 索引（`USING hnsw (embedding vector_cosine_ops)`）做近似最近邻搜索。
   *
   * **业务场景**：AI 长期记忆 / 历史消息检索——
   * 「我上次说过的那个部署问题」能在语义层面命中相关记录。
   */
  async searchSimilarMessages(
    conversationId: number,
    searchText: string,
    limit = 5,
  ): Promise<SemanticSearchResult[]> {
    // ① 校验会话存在（不存在直接 404，避免做无用的向量计算）
    const conversation = await this.em.findOne(Conversation, {
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation #${conversationId} not found`);
    }

    // ② 搜索词向量化 —— 必须与入库时使用**同一个模型**，否则向量空间不一致
    const vector = await this.embedQuery(searchText);

    // ③ 原生 SQL：匹配 → 距离排序 → 取 Top K
    const rows: SemanticSearchResult[] = await this.em.query(
      `SELECT id, conversation_id, role, content, created_at,
              1 - (embedding <=> $1::vector) AS similarity
       FROM messages
       WHERE conversation_id = $2 AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [JSON.stringify(vector), conversationId, limit],
    );

    // ④ pg 的 numeric 类型经驱动返回的是 string，显式转成 number 再对外
    return rows.map((row) => ({
      ...row,
      similarity: Number(row.similarity),
    }));
  }

  /**
   * 获取（懒加载）embedding 模型实例
   *
   * @returns OpenAIEmbeddings 实例
   * @throws BadRequestException 未配置 API Key 时抛出 400
   *
   * @remarks
   * 懒加载 + 缓存：首次调用才创建，之后复用。
   * 模型初始化涉及 SDK 构造，每次请求重建会造成不必要的开销。
   *
   * 按优先级读取环境变量：优先 `EMBEDDINGS_*`（专用向量服务），
   * 回退到 `OPENAI_*`（通用对话服务）——两者可以是不同厂商，
   * 只要 API 兼容 OpenAI 协议即可。
   */
  private getEmbeddings(): OpenAIEmbeddings {
    if (!this.embeddings) {
      if (!process.env.OPENAI_API_KEY) {
        throw new BadRequestException(
          '语义检索需要配置 OPENAI_API_KEY（与 pgsql-test 相同）',
        );
      }
      this.embeddings = new OpenAIEmbeddings({
        model: process.env.EMBEDDING_MODEL || 'text-embedding-v3',
        apiKey: process.env.OPENAI_API_KEY,
        configuration: {
          baseURL: process.env.OPENAI_BASE_URL,
        },
      });
    }
    return this.embeddings;
  }

  /**
   * 把一段文本转成向量
   *
   * @param text - 待向量化的文本
   * @returns 长度为 1024 的浮点数组
   *
   * @remarks
   * 封装成私有方法是为了统一走 {@link getEmbeddings} 的懒加载逻辑，
   * 业务方法里不必关心模型实例的生命周期。
   */
  private async embedQuery(text: string): Promise<number[]> {
    return this.getEmbeddings().embedQuery(text);
  }
}
