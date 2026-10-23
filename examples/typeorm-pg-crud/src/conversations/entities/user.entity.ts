import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';

/**
 * 用户实体 —— 映射数据库 `users` 表
 *
 * @remarks
 * 对应建表语句（`examples/pgsql-test/init-scripts/create_tables.sql`）：
 * ```sql
 * CREATE TABLE users (
 *   id SERIAL PRIMARY KEY,
 *   name TEXT NOT NULL,
 *   created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
 * );
 * ```
 *
 * 在整条业务链路上，User 是一对多关系的**起点**：
 * ```text
 * User 1 ──── N Conversation 1 ──── N Message
 * ```
 * 用户登录后拉取左侧会话列表，就是从 User 出发沿这条链向下查。
 */
@Entity('users')
export class User {
  /**
   * 主键，自增
   *
   * @remarks
   * `@PrimaryGeneratedColumn()` 对应 SQL 的 `SERIAL PRIMARY KEY`。
   * TypeORM 会把它识别为自增列，插入时无需手动赋值。
   */
  @PrimaryGeneratedColumn()
  id: number;

  /** 用户名 */
  @Column({ type: 'text' })
  name: string;

  /**
   * 创建时间，插入时由数据库自动填充
   *
   * @remarks
   * `@CreateDateColumn` 在 INSERT 时自动写入当前时间，无需业务代码干预，
   * 等价于 SQL 的 `DEFAULT CURRENT_TIMESTAMP`。
   */
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  /**
   * 该用户拥有的全部会话（一对多）
   *
   * @remarks
   * **这是 ORM 层的虚拟字段，不对应 `users` 表里的任何一列。**
   * 真实的外键 `user_id` 存在 `conversations` 表上（见 {@link Conversation}）。
   *
   * 它是 `@ManyToOne` 的反向端（inverse side）：
   * - 数据层面：仅用于告诉 TypeORM「关系的另一头在哪」
   * - 查询层面：配合 `relations: { conversations: true }` 触发关联查询（JOIN）
   *
   * @see {@link Conversation.user} 关系的拥有端（owning side）
   */
  @OneToMany(() => Conversation, (conversation) => conversation.user)
  conversations: Conversation[];
}
