# IndexedDB

IndexedDB 是浏览器内置的异步事务型数据库。它不是 SQLite 的替代品，而是运行在用户浏览器里的本地存储引擎——用于离线 Web 应用、本地缓存大量数据、PWA（渐进式 Web 应用）等场景。

与 localStorage 的对比：

| 维度 | localStorage | IndexedDB |
|------|-------------|-----------|
| 容量 | 5MB | 浏览器总磁盘空间的百分比（通常 GB 级） |
| 数据类型 | 仅字符串 | 任意 JS 类型（对象、数组、Blob、File） |
| 查询 | 无（只能遍历） | 支持索引和多条件查询 |
| 事务 | 不支持 | 支持 ACID 事务 |
| 异步 | 同步（阻塞主线程） | 异步（不阻塞 UI） |

> **铁律：超过几百 KB 的数据、需要搜索查询的数据、需要结构化的数据 → 用 IndexedDB，不要用 localStorage。**

## 原生 API vs Dexie.js

IndexedDB 原生 API 是回调风格的，写起来非常繁琐。社区公认的最佳实践是使用 **[Dexie.js](https://dexie.org/)** 这个轻量封装库。本文以 Dexie.js 为主——你可以在真实项目中直接用。

```bash
npm install dexie
```

## 基础操作

### 创建数据库和表

```js
import Dexie from 'dexie';

const db = new Dexie('MyAppDB');

// 定义表结构和索引
db.version(1).stores({
  users: '++id, username, email, &email',  // ++id=自增主键, &=唯一索引
  notes: '++id, title, created_at',
});

// 或更现代的 TypeScript 风格
const db = new Dexie('MyAppDB') as Dexie & {
  users: Dexie.Table<User, number>;
  notes: Dexie.Table<Note, number>;
};

db.version(1).stores({
  users: '++id, username, email',
  notes: '++id, title, created_at',
});
```

**索引声明语法：**

| 符号 | 含义 | 示例 |
|------|------|------|
| `++` | 自增主键 | `++id` |
| `&` | 唯一索引 | `&email` |
| `*` | 多条目索引 | `*tags` |
| `[a+b]` | 复合索引 | `[firstName+lastName]` |

### CRUD 操作

```js
// ========== 插入 ==========
await db.users.add({ username: '张三', email: 'zhangsan@example.com' });
await db.users.bulkAdd([
  { username: '李四', email: 'lisi@example.com' },
  { username: '王五', email: 'wangwu@example.com' },
]);

// ========== 查询 ==========
const user = await db.users.get(1);                        // 按主键
const byEmail = await db.users.get({ email: 'zhangsan@example.com' });  // 按唯一索引

// 条件查询
const results = await db.users
  .where('username').startsWith('张')
  .toArray();

// 范围查询
const adults = await db.users
  .where('id').between(1, 10)
  .toArray();

// 排序 + 分页
const page = await db.users
  .orderBy('id')
  .reverse()
  .offset(0)
  .limit(20)
  .toArray();

// 计数
const count = await db.users.where('username').startsWith('张').count();

// ========== 更新 ==========
await db.users.update(1, { email: 'new@example.com' });

// 批量更新
await db.users.where('email').equals('old@example.com').modify({ is_active: false });

// ========== 删除 ==========
await db.users.delete(1);
await db.users.where('id').below(100).delete();
await db.users.clear();  // 清空表

// ========== 每次仅取一条 ==========
const first = await db.users.orderBy('id').first();
const last = await db.users.orderBy('id').last();
```

### 事务

Dexie 自动将操作包装在事务中：

```js
// 显式事务：保证多个操作原子性
await db.transaction('rw', [db.users, db.notes], async () => {
  await db.users.add({ username: '新用户', email: 'new@example.com' });
  await db.notes.add({ title: '欢迎', content: '这是第一条笔记' });
  // 如果任何一步失败，全部回滚
});
```

## 实战：离线笔记应用

```js
class NotesStore {
  constructor() {
    this.db = new Dexie('NotesApp');
    this.db.version(1).stores({
      notes: '++id, title, created_at, updated_at, synced',
    });
  }

  // 创建笔记
  async create(title, content) {
    const now = new Date().toISOString();
    return await this.db.notes.add({
      title, content, created_at: now, updated_at: now, synced: false
    });
  }

  // 更新笔记
  async update(id, updates) {
    return await this.db.notes.update(id, {
      ...updates, updated_at: new Date().toISOString(), synced: false
    });
  }

  // 搜索笔记
  async search(keyword) {
    return await this.db.notes
      .filter(note => note.title.includes(keyword) || note.content.includes(keyword))
      .toArray();
  }

  // 获取未同步的笔记
  async getUnsynced() {
    return await this.db.notes.where('synced').equals(false).toArray();
  }

  // 标记为已同步
  async markSynced(ids) {
    await this.db.notes.where('id').anyOf(ids).modify({ synced: true });
  }

  // 获取最近的笔记（分页）
  async recent(page = 1, pageSize = 20) {
    return await this.db.notes
      .orderBy('updated_at')
      .reverse()
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();
  }
}
```

## 最佳实践

### 1. 版本管理

每次修改表结构时递增版本号，添加新的 `stores` 定义但保留旧版本的处理逻辑：

```js
db.version(1).stores({ users: '++id, username' });
db.version(2).stores({ users: '++id, username, email, &email' });  // 升级
```

### 2. 不要存大文件

IndexedDB 虽然可以存 Blob/File，但大文件会让数据库文件膨胀、操作变慢。大文件用 [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) 或 [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) 更合适。

### 3. 大量数据分页查询

```js
// 不要一次性 toArray() 读取数万条数据
// 使用 offset/limit 分页
const batch = await db.users.orderBy('id').offset(page * 50).limit(50).toArray();
```

### 4. 利用 Web Worker

在 Web Worker 中操作 IndexedDB，避免阻塞主线程 UI 渲染：

```js
// worker.js
import Dexie from 'dexie';
const db = new Dexie('MyAppDB');
// ... 在 worker 中执行数据的增删改查
```

## 浏览器存储全景对比

| 技术 | 容量 | 类型 | 查询 | 异步 | 适用 |
|------|------|------|------|------|------|
| `localStorage` | 5MB | 字符串 | 无 | 同步 | 配置/令牌/少量偏好 |
| `sessionStorage` | 5MB | 字符串 | 无 | 同步 | 单会话临时状态 |
| **IndexedDB** | GB 级 | 任意 JS 类型 | 索引+过滤 | 异步 | 离线数据/大量缓存/PWA |
| Cache API | 较大 | HTTP 响应 | URL 匹配 | 异步 | 离线静态资源 |
| OPFS | 较大 | 文件 | 文件系统 | 异步 | 大文件/二进制 |

## 学习小结

- [x] 理解了 IndexedDB 的定位：浏览器端的异步事务数据库，不是 localStorage 的替代
- [x] 掌握了 **Dexie.js** 的声明式建表、CRUD 和事务操作
- [x] 学会了索引声明语法（`++ / & / * / [a+b]`）
- [x] 理解了离线应用的数据同步模式（synced 状态 + 批量同步）
- [x] 建立了浏览器端存储选型的全景认知
