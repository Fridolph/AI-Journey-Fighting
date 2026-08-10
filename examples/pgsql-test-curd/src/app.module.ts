import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsModule } from './conversations/conversations.module';
import { PrismaConversationsModule } from './prisma-conversations/prisma-conversations.module';
import { User } from './conversations/entities/user.entity';
import { Conversation } from './conversations/entities/conversation.entity';
import { Message } from './conversations/entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'user',
      password: '123456',
      database: 'hello_pg',
      synchronize: true,
      logging: true,
      entities: [User, Conversation, Message],
    }),
    ConversationsModule,
    PrismaConversationsModule, // ← 已注册：TypeORM 和 Prisma 两个模块并存
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
