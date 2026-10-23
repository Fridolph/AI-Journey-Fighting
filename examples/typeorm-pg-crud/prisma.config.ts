// Prisma 7 配置（新版采用独立的 config 文件，不再把 url 写在 schema.prisma 里）
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // 连接串来自 .env 的 DATABASE_URL（与 TypeORM 版指向同一个库）
    url: process.env['DATABASE_URL'],
  },
});
