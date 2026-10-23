import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';

/**
 * 消息角色枚举 —— 对应数据库的 CHECK 约束
 *
 * @remarks
 * 建表语句里约束是：
 * ```sql
 * role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system'))
 * ```
 * TypeORM 不支持直接声明 CHECK，这里用 enum 在应用层做同样的约束，
 * 保证写入数据库的值一定是这三个之一。
 */
export enum MessageRole {
  /** 用户发的消息 */
  USER = 'user',
  /** AI 回复的消息 */
  ASSISTANT = 'assistant',
  /** 系统提示词（不展示给用户） */
  SYSTEM = 'system',
}

/**
 * 消息实体 —— 映射数据库 `messages` 表
 *
 * @remarks
 * 对应建表语句：
 * ```sql
 * CREATE TABLE messages (
 *   id SERIAL PRIMARY KEY,
 *   conversation_id INTEGER NOT NULL,
 *   role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
 *   content TEXT NOT NULL,
 *   embedding vector(1024),          -- pgvector 扩展类型
 *   created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
 *   FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
 * );
 * CREATE INDEX idx_messages_embedding
 *   ON messages USING hnsw (embedding vector_cosine_ops);
 * ```
 *
 * **这是整条链路里最关键的一张表**——它同时承载两种能力：
 * 1. **关系查询**：通过 `conversation_id` 挂在会话下（一对多的「多」端）
 * 2. **语义检索**：通过 `embedding` 向量列做最近邻搜索（pgvector）
 *
 * 正因为这两者落在同一张表，才不需要 MySQL + Milvus 双写。
 */
@Entity('messages')
export class Message {
  /** 主键，自增（对应 `SERIAL PRIMARY KEY`） */
  @PrimaryGeneratedColumn()
  id: number;

  /** 所属会话 ID —— 真实外键列（`conversation_id`） */
  @Column({ name: 'conversation_id' })
  conversationId: number;

  /**
   * 消息角色
   *
   * @remarks
   * 数据库里是 `TEXT + CHECK`，TS 侧用 {@link MessageRole} 枚举表达。
   * 注意：TypeORM 的 `enum` 选项在这里**不生成数据库 enum 类型**，
   * 因为列类型显式声明为 `text`，`enum` 仅用于应用层校验/序列化。
   */
  @Column({
    type: 'text',
    enum: MessageRole,
  })
  role: MessageRole;

  /** 消息正文 */
  @Column({ type: 'text' })
  content: string;

  /**
   * 消息内容的向量表示（1024 维）—— pgvector 扩展类型
   *
   * @remarks
   * - `'vector'` 是自定义列类型：必须先在数据库执行 `CREATE EXTENSION vector`
   *   并让 `pg` 驱动认得它，否则 TypeORM 同步表结构时会报类型不存在。
   * - `length: 1024` 必须与 embedding 模型输出维度一致
   *   （本仓库用千问 `text-embedding-v3`，输出 1024 维）。
   * - **可为空**：不是每条消息都必须带向量，写入时按需生成。
   *
   * 查询侧走原生 SQL，因为相似度操作符 `<=>` 不是标准 SQL，
   * TypeORM 的 QueryBuilder 不认识它
   * （见 `ConversationsService.searchSimilarMessages`）。
   */
  @Column('vector', { length: 1024, nullable: true })
  embedding: number[] | null;

  /** 创建时间，插入时自动填充 */
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  /**
   * 所属会话（多对一）
   *
   * @remarks
   * 关系的拥有端：外键 `conversation_id` 由 `@JoinColumn` 指定，
   * `onDelete: 'CASCADE'` 表示删除会话时级联删除其下所有消息。
   *
   * @see {@link Conversation.messages} 反向端
   */
  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;
}
