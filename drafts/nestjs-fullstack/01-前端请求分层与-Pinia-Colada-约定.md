# 前端请求分层与 Pinia Colada 约定

> 记录于 2026-11-08，项目：`nestjs-nuxt-admin-temp`
> 相关文件：`app/plugins/api.ts`、`layers/12-teams/app/composables/useUsers.ts`、`layers/12-teams/app/types/user.ts`

## 1. 背景与要解决的问题

`/team/users` 的第一版把请求写得很散：页面里直接 `useApi().post("/users")`，三个 mutation 各写一遍 `try/catch + refresh + toast`，`saveError` / `deleteError` / `saving` 全部手写 `ref`。

由此产生三个需要拍板的问题：

1. 像 `useApi()` 这种"转发 HTTP 动词"的封装要不要留？
2. 要不要单列 `api/users.ts` 领域层？
3. 查询（`useUsersQuery`）与写操作（`useUserMutations`）该合并还是拆开？

## 2. 结论速查

| 议题 | 结论 | 一句话理由 |
| --- | --- | --- |
| `useApi()` 动词转发 | **删除** | 不减少重复、不增加语义，只是多一跳 |
| 独立 `api/users.ts` | **暂不设** | 每个接口只有一个调用点，抽出去只是搬位置 |
| query / mutation 合并 | **合并为 `useUsers`** | 二者共享"写成功必须让列表失效"这段私有逻辑 |
| 命名 | `create` → `createUser` | 补名词，不加冗余形容词（不需要 `New`） |

## 3. 判断规则（可直接复用）

### 3.1 一层间接何时值得存在

> **如果它在当前代码里只是把唯一一处挪了个位置，而不是消除第二处重复，那就是成本。**

两个必要条件，满足其一才抽层：

- **消除重复**：同一段逻辑/路径/类型在 2 处以上出现；
- **增加约束**：封装后能强制某种正确性（如统一错误形态、统一鉴权头）。

`useApi()` 两条都不满足：`get/post/patch/remove` 不消除重复（`$fetch` 原生支持 `method`），也不增加约束，反而压窄了 `$fetch` 的类型能力。

`api/users.ts` 只满足"将来可能有第二处"，属于**预支抽象成本**。

**反例（必须保留的层）**：`app/plugins/api.ts`。它增加约束——所有请求统一 baseURL、统一把 HTTP 错误与"HTTP 200 + 业务码 >= 400"两种失败都转成 `ApiError`。没有它，Colada 会把业务失败当成查询成功。

### 3.2 何时该合并、何时该拆分 composable

判断维度是**内聚**，不是文件数量。

合并的正确理由：
- 共享私有逻辑（本项目的 `invalidateUsers`）；
- 服务于同一屏、同一资源的完整交互闭环。

拆分的触发条件（任一满足即拆）：

- 出现第二个资源（`roles`、`permissions`）；
- 动作数量继续膨胀（经验值：> 5 个写操作）；
- 别的页面只要列表、却被拖入整套写操作。

### 3.3 命名约定

- 写操作一律 `动词 + 资源`：`createUser`、`updateUserProfile`、`deleteUser`；
- 不写 `create`、`remove` 这类脱离上下文就失义的词；
- 不加冗余修饰：`createNewUser` 里的 `New` 没有区分对象，删掉；只有当存在对立项（如 `inviteUser` vs `createUser`）时才用限定词；
- 查询返回的字段也要自解释：`displayPage` 而不是 `page`（后者会与来自 URL 的 `page` 混淆）。

## 4. 落地结构

```
页面 users.vue                 只做编排：URL ⇄ 查询参数、抽屉/弹窗开关
   ↑
composables/useUsers.ts        列表查询 + 写操作 + 缓存失效 + 派生状态
   ↑
types/user.ts                  领域类型（避免 utils 反向依赖 composable）
   ↑
plugins/api.ts                 传输层：baseURL、请求头、错误归一化 → $api
```

关键点：`useUsers({ page, size })` 返回

| 类别 | 字段 |
| --- | --- |
| 数据 | `users`、`total`、`displayPage`、`displaySize` |
| 状态 | `error`、`isInitialLoading`、`loading`、`isEmpty`、`refetch` |
| 写操作 | `createUser`、`updateUserProfile`、`deleteUser` |
| 写状态 | `saving`、`saveError`、`deleting`、`deleteError` |

页面不再需要知道 `isLoading` 怎么合并、错误从哪个 mutation 取。

## 5. Pinia Colada 要点（本次实践沉淀）

1. **`key` 是缓存身份，不是请求参数**。一页一个条目，所以 `key` 必须是 getter；`invalidateQueries({ key: ["users"] })` 靠前缀命中所有页。
2. **`staleTime` 与 `gcTime` 是两件事**：前者决定"是否重新请求"，后者决定"没人用后缓存留多久"。实测：第 1 页 → 第 2 页 → 回第 1 页，60 秒内零新增请求。
3. **`placeholderData: previousData => previousData`** 用于翻页：保留上一页数据，避免 `data` 变 `undefined` 导致表格闪空、总数归零、分页器跳回第 1 页。
   - 与 `initialData` 的区别：`placeholderData` 不改变缓存状态、不参与 SSR 序列化；`initialData` 会。
4. **派生展示值要跟"数据"走，不跟"意图"走**：用 `data.pagination.page` 计算"显示 1–5 条"，而不是用 URL 里的 `page`。否则慢网翻页时会出现"文案 6–8、屏幕 1–5"。
5. **`useMutation` 不缓存数据，管"写 + 失效"**：`onSuccess` 里 `invalidateQueries`；失败不要吞，写进 `mutation.error` 由 UI 渲染，`mutateAsync` 仍 reject 以便调用方决定是否关闭弹层。
6. **`refresh()` vs `refetch()`**：前者尊重新鲜度，后者强制重发。刷新按钮用 `refetch()`。

## 6. 加载与错误的 UX 约定

| 场景 | 表现 | 理由 |
| --- | --- | --- |
| 首次加载（无缓存/无 SSR 数据） | 骨架屏 5 行 + `aria-busy` | 此时没数据，渲染空表格会闪一下表头 |
| 翻页 / 刷新 | 保留旧数据 + 表格 loading | 有 `placeholderData`，不该闪空 |
| 列表请求失败 | 错误卡片 + 「重试」按钮 | 可恢复错误要给出口 |
| 创建 / 编辑失败 | 抽屉内就地提示 | 错误离操作最近 |
| 删除失败 | 确认弹窗内就地提示 | 同上 |
| 写成功但刷新失败 | warning toast，不当作写失败 | 数据已落库，刷新失败是另一层问题 |

连续点击保护：`saving` / `deleting` 期间直接 return，避免重复提交。

## 7. 验证记录（2026-11-08）

用 CDP 驱动 headless Chrome 打真实后端（本地 3000 端口）：

- 客户端路由进入 `/team/users`（限速 900ms）：400ms 时 `rows: 0`、骨架元素 5 个、`aria-busy: true`；数据到达后 `rows: 9`、骨架消失。
- 点击分页第 2 页（限速 800ms）：250ms 时 `rows` 仍为 5、`total` 仍为 8、无"暂无数据"文案、表格 loading 生效；加载完成后变 3 行、"显示 6–8"。
- 返回第 1 页：无新增 `/users` 请求（缓存命中）。
- 删除用户：`OPTIONS` 预检 → `DELETE /users/:id`（200）→ `GET /users`（失效重拉），toast 正确，行数减少。
- 控制台 error / warning 均为 0；`pnpm typecheck`、`pnpm lint`、`pnpm test`（10/10）通过。

## 8. 触发重新抽象的条件（写下来，避免争论重复发生）

出现以下**任一**情况，就该把领域层 `api/users.ts` 加回来：

- 同一接口出现第二个调用点（详情抽屉、hover 预取、服务端 loader）；
- 需要脱离 Nuxt 上下文对该接口写单测；
- 接口路径或响应包装需要在多处保持一致，靠约定已经守不住。

## 9. 下一步

1. **乐观更新**：删除时先 `setQueryData` 移除行，失败用 `onMutate` 的 context 回滚——Colada 体验优化里收益最高的一项。
2. `defineQueryOptions` / `defineQuery` 的引入时机：同一 `key` 被两个同时挂载的组件使用时。
3. 预取：hover 分页器时 `queryCache.ensure` 预拉下一页。
