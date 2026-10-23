import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Message } from './message.entity';

/**
 * 会话实体 —— 映射数据库 `conversations` 表
 *
 * @remarks
 * 对应建表语句：
 * ```sql
 * CREATE TABLE conversations (
 *   id SERIAL PRIMARY KEY,
 *   user_id INTEGER NOT NULL,
 *   title TEXT,
 *   created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
 *   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
 * );
 * ```
 *
 * **它在一对多链路中同时扮演两个角色**：
 * ```text
 * User 1 ──N Conversation          ← 作为「多」端，持有指向 User 的外键 user_id
 * Conversation 1 ──N Message       ← 作为「一」端，Message 那边持有 conversation_id
 * ```
 *
 * 也就是说：它既有 `@ManyToOne`（向上指向 User），
 * 又有 `@OneToMany`（向下指向 Message）。
 */
@Entity('conversations')
export class Conversation {
  /** 主键，自增（对应 `SERIAL PRIMARY KEY`） */
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * 所属用户 ID —— **这就是真实存在的外键列**
   *
   * @remarks
   * `@Column({ name: 'user_id' })` 把 TS 的驼峰 `userId` 映射到数据库的蛇形 `user_id`。
   *
   * 关系查询时可以只读这个裸 ID（`conversation.userId`），
   * 不需要 JOIN users 表——这是 ORM 的常规优化点。
   */
  @Column({ name: 'user_id' })
  userId: number;

  /** 会话标题，可为空（`title TEXT`，无 NOT NULL 约束） */
  @Column({ type: 'text', nullable: true })
  title: string | null;

  /** 创建时间，插入时自动填充（等价于 `DEFAULT CURRENT_TIMESTAMP`） */
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  /**
   * 所属用户（多对一）
   *
   * @remarks
   * **关系的拥有端（owning side）** —— 关系的真实外键由这里决定。
   *
   * 两个装饰器各司其职：
   * - `@ManyToOne`：声明关系类型 + `onDelete: 'CASCADE'`
   *   （数据库层表现为 `FOREIGN KEY ... ON DELETE CASCADE`：删用户会自动删掉他的会话）
   * - `@JoinColumn({ name: 'user_id' })`：指定用哪一列作为外键
   *
   * 若去掉 `@JoinColumn`，TypeORM 会自动生成 `userId`/`user_id` 之类的列名，
   * 可能和已有表结构对不上，所以显式写出来更稳妥。
   *
   * @see {@link User.conversations} 反向端
   */
  @ManyToOne(() => User, (user) => user.conversations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * 该会话下的全部消息（一对多）
   *
   * @remarks
   * 同样是**虚拟字段**，真实外键 `conversation_id` 在 `messages` 表上。
   * 查询时配合 `relations: { messages: true }` 使用。
   *
   * @see {@link Message.conversation} 关系的拥有端
   */
  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];
}
