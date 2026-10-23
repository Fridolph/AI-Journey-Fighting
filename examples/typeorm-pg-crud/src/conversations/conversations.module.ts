import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';

/**
 * 会话功能模块
 *
 * @remarks
 * NestJS 的模块是「功能边界」的载体，`ConversationsModule` 把
 * 该功能相关的 Controller 和 Service 打包在一起。
 *
 * **为什么这里没有 `imports`？**
 * - TypeORM 的连接（`TypeOrmModule.forRoot`）已在 {@link AppModule} 全局注册
 * - 本模块通过 `@InjectEntityManager()` 拿到 EntityManager，
 *   它由 root 连接提供，**不需要** `TypeOrmModule.forFeature([...])`
 *
 * 什么时候才需要 `forFeature`？
 * 当你想用 `@InjectRepository(User)` 注入某个实体的 **Repository** 时。
 * 本项目统一用 EntityManager，所以省掉了这一步。
 *
 * @see AppModule 根模块，注册 TypeORM 连接并挂载本模块
 */
@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
