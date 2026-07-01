import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BookModule } from './book/book.module';
import { Book } from './book/entities/book.entity';

const isProduction = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'public'),
      serveRoot: '/books',
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: isProduction ? 'mysql-prod' : 'localhost',
      port: 3306,
      username: 'root',
      password: 'admin',
      database: 'book',
      synchronize: true,
      connectorPackage: 'mysql2',
      logging: true,
      autoLoadEntities: true,
      entities: [Book],
    }),
    BookModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
