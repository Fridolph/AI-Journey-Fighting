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
| 删除失败 | **toast** 提示「删除失败，列表已恢复」 | 删除走乐观更新，弹窗已立即收起，错误只能落到全局 |
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

## 9. 乐观删除（2026-11-08 实践）

### 9.1 四步法，缺一不可

```ts
useMutation({
	// ① 请求发出前：取消在途请求 → 快照 → 先改缓存
	onMutate(id) {
		queryCache.cancelQueries({ key: ['users'] })
		const snapshots = snapshotUsersCache()
		removeUserFromCache(id)
		return { snapshots }
	},
	// ② 真正的请求
	mutation: id => api(`/users/${id}`, { method: 'DELETE' }),
	// ③ 失败：用快照整体回滚
	onError(error, _id, context) {
		for (const s of context?.snapshots ?? []) queryCache.setQueryData(s.key, s.data)
		toast.add({ title: '删除失败，列表已恢复', description: error.message, color: 'error' })
	},
	// ④ 成功：失效并重拉
	async onSuccess() {
		toast.add({ title: '用户已删除', color: 'success' })
		await queryCache.invalidateQueries({ key: ['users'] })
	},
})
```

逐条理由：

1. **`cancelQueries` 必须第一个做**。分页查询可能在途（翻页、刷新），它回来的旧数据会直接覆盖掉乐观修改，表现为"删掉的行又回来了"。
2. **快照要覆盖所有缓存页，不只是当前页**。回滚时逐页写回，否则切页会看到半新半旧的数据。
3. **`total` 每页都要减一**。分页不重叠，目标行只在一页里，但 `total` 在每个分页响应里都有一份；只改当前页的话，切到别的缓存页数字会跳。
4. **乐观更新不能替代重拉**。删掉一行会让后面所有页的数据前移，新的分页边界只有服务端知道。所以 `onSuccess` 里仍然要 `invalidateQueries`。

### 9.2 被问到的那个场景：末页最后一条

这是乐观删除最容易出问题的地方，实际要处理三件事：

**（1）`total` 先减一，`lastPage` 立刻变小**

```ts
const lastPage = computed(() => Math.max(1, Math.ceil(total.value / displaySize.value)))
```

第 3 页只有 1 条、`size=5`、`total=11` 时删掉它：乐观 `total` 变 10 → `lastPage` 变 2 → 已知"当前页已越界"。

**（2）页码只能在删除成功后才收回**

如果一发现越界就 `navigateTo`，删除失败回滚后会出现"跳到第 2 页又跳回来"。所以 watcher 要拿 `deleting` 做闸门，并且把 `deleting` 本身也放进依赖——删除结束那一刻需要再跑一次，把迟到的判断补上：

```ts
watch([displayPage, lastPage, deleting], ([dataPage, last, isDeleting]) => {
	if (import.meta.server || isDeleting || dataPage !== page.value) return
	if (dataPage > last) void goToPage(last)
}, { immediate: true })
```

**（3）不能让「暂无用户数据」闪出来**

末页被清空到成功收回页码之间，`users.length === 0` 且 `status === 'success'`，空状态提示会闪一下。用两个条件挡住：

```ts
const isEmpty = computed(() =>
	status.value === 'success' && !deleting.value &&
	users.value.length === 0 && displayPage.value <= lastPage.value
)
```

同时在「没有行」时隐藏分页条——此时它只剩一个 0 行的范围文案，没有意义。

**（4）顺带修掉的文案问题**

「显示 X–Y 条」不能再用 `页码 × 每页条数` 推算，因为乐观删除后行数比公式少一条。改成按实际行数推算：

```ts
const firstItem = computed(() => users.value.length ? (displayPage.value - 1) * displaySize.value + 1 : 0)
const lastItem = computed(() => users.value.length ? firstItem.value + users.value.length - 1 : 0)
```

### 9.3 交互上的取舍

**确认即关弹窗**。乐观更新的价值就是"不等服务端"，如果弹窗还压着等 loading，乐观就没意义了。代价是失败时错误只能走 toast——这对删除是可接受的（行会自己回来，用户能立刻看到）。

对比：创建 / 编辑**不做**乐观，因为需要服务端生成的 id 与唯一性校验，且抽屉内就地报错的信息量更大。

### 9.4 验证记录（限速 800ms，真实后端）

| 场景 | 预期 | 实测 |
| --- | --- | --- |
| 末页最后一条，确认后 200ms | 行立即消失、`total` 已减一、页码暂不跳 | `total: 共 10 条`、范围文案消失、仍停在 `page=3` |
| 删除成功后 | 自动收回第 2 页 | `?size=5&page=2`、5 行、`显示 6–10` |
| 普通页删除，确认后 200ms | 行立即消失、`total` 减一 | 10 行 → 9 行、`共 9 条`、`显示 1–9` |
| 删除失败（外键约束） | 行回到原位 + toast | 9 行 → 10 行、`删除失败，列表已恢复` |
| 控制台 | 无 error / warning | 无 |

## 10. 下一步

1. `defineQueryOptions` / `defineQuery` 的引入时机：同一 `key` 被两个同时挂载的组件使用时。
2. 预取：hover 分页器时 `queryCache.ensure` 预拉下一页。
3. 删除成功后的"多余一次请求"：末页清空时，失效重拉会先拉一次即将离开的空页，再拉上一页。可以在 `onSuccess` 里判断并跳过空页的重拉。
