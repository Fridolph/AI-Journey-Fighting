# ORM（对象关系映射）

## 一句话

**用写代码的方式操作数据库，不用手写 SQL。** `user.save()` 代替 `INSERT INTO users ...`。

## 核心直觉

```js
// 不用 ORM：手写 SQL 字符串
await db.query('SELECT * FROM users WHERE email = ?', [email]);

// 用 ORM（Prisma）：
const user = await prisma.user.findUnique({ where: { email } });
```

ORM 把数据库的表映射成编程语言的对象（类/接口），把 SQL 操作映射成对象方法——这就是 Object-Relational Mapping。

## 常见 ORM

| ORM | 语言 | 风格 | 适合 |
|-----|------|------|------|
| **Prisma** | TS/JS | Schema-first | 类型安全优先，全栈项目首选 |
| **Drizzle** | TS/JS | SQL-like | 接近原生 SQL，喜欢手写查询 |
| **TypeORM** | TS/JS | Decorator | NestJS 生态，装饰器风格 |
| **Sequelize** | TS/JS | Model-based | 老牌 ORM，生态成熟 |

## 优缺点

**优点：** 类型安全（TypeScript 下编译时就能发现字段拼错），自动迁移（改 Schema 自动同步表结构），防止 SQL 注入
**缺点：** 复杂查询不如手写 SQL 灵活，多一层抽象（出问题要查「为什么生成这样的 SQL」），N+1 查询陷阱

## 小结

ORM 是「用对象的思维操作数据库」——前端熟悉的对象语法替代 `SELECT`/`INSERT`。Prisma 是目前 TypeScript 全栈项目的主流选择，但它不替代你对 SQL 的理解——复杂查询时你依然需要知道背后生成了什么 SQL。

## 下一步

- [Prisma 入门看这里](/articles/2026-05-16__prisma-guide/)
