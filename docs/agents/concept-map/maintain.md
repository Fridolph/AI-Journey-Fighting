# AI 概念地图维护说明

这份文档专门说明 `/agents/concept-map/` 这一页是怎么组织的，以及后续要怎么做增删改查。

仓库源码入口：
[AI-Journey-Fighting](https://github.com/Fridolph/AI-Journey-Fighting)

## 一、地图是怎么画出来的

概念地图不是手动画布，而是 **数据驱动渲染**：

1. 数据源在 [aiConceptMap.ts](https://github.com/Fridolph/AI-Journey-Fighting/blob/main/docs/.vitepress/data/aiConceptMap.ts)
2. 画布组件在 [ConceptMapBoard.vue](https://github.com/Fridolph/AI-Journey-Fighting/blob/main/docs/.vitepress/theme/components/ConceptMapBoard.vue)
3. 详情组件在 [ConceptMapDetail.vue](https://github.com/Fridolph/AI-Journey-Fighting/blob/main/docs/.vitepress/theme/components/ConceptMapDetail.vue)
4. 页面容器在 [AiConceptMap.vue](https://github.com/Fridolph/AI-Journey-Fighting/blob/main/docs/.vitepress/theme/components/AiConceptMap.vue)

真正决定“画成什么样”的，是 `aiConceptMap.ts` 里的三块数据：

- `conceptGroups`
  负责概念分组、颜色、组名
- `conceptNodes`
  负责每个节点的标题、状态、位置、说明、链接
- `conceptLinks`
  负责节点之间的连线关系

## 二、坐标怎么理解

每个节点都有：

```ts
x: 64,
y: 70
```

这里的 `x` 和 `y` 不是像素，而是画布百分比坐标，范围建议控制在 `0 - 100`。

- `x`
  控制节点左右位置，越大越靠右
- `y`
  控制节点上下位置，越大越靠下

可以直接把它理解成：

```text
左上角 = (0, 0)
右下角 = (100, 100)
```

### 调整位置的经验

- 新节点先放在 `x/y` 大致区域，先求结构对，再微调视觉
- 尽量避免节点贴边，通常 `x` 不要太接近 `0` 或 `100`
- 如果桌面端遮挡，先调 `x/y`
- 如果移动端不好看，不用调 `x/y`
  因为移动端会自动退化成纵向卡片列表

## 三、Node 的 CRUD

### 1. 新增一个概念节点

在 `conceptNodes` 里新增一个对象：

```ts
{
  id: 'context-window',
  label: 'Context Window',
  subtitle: '上下文窗口',
  groupId: 'generation',
  status: 'next',
  x: 72,
  y: 18,
  summary: '一句话说明这个概念解决什么问题。',
  keyQuestion: '用来自测的问题。',
  examples: [
    sourceFile('对应源码或资料', 'examples/xxx/src/demo.mjs')
  ],
  experiments: [
    '一个最小改动实验。'
  ],
  docs: [
    docLink('站内文档', '/agents/xxx/')
  ]
}
```

几个硬规则：

- `id` 必须唯一
- `groupId` 必须能在 `conceptGroups` 里找到
- `status` 只能是 `done | learning | next | later`
- `examples` 和 `docs` 都是可点击资源

### 2. 修改一个概念节点

直接改对应节点对象即可，最常改的是：

- `summary`
- `keyQuestion`
- `experiments`
- `x / y`
- `docs`

### 3. 删除一个概念节点

删除节点时要一起检查 `conceptLinks`，把引用这个 `id` 的线也删掉。

否则虽然代码不会一定报错，但这条关系线会失效。

## 四、Link 的 CRUD

### 1. 新增一条连线

在 `conceptLinks` 里加一条：

```ts
{ source: 'prompt', target: 'tool-calling', label: '约束工具使用' }
```

含义：

- `source`
  起点节点 id
- `target`
  终点节点 id
- `label`
  当前主要用于表达关系含义，后续如果要做 hover 提示也可以继续复用

### 2. 修改连线

直接调整 `source / target / label` 即可。

### 3. 删除连线

从 `conceptLinks` 中移除对应对象即可。

## 五、Group 的 CRUD

### 1. 新增分组

在 `conceptGroups` 里新增：

```ts
{
  id: 'evaluation',
  label: '评测体系',
  description: '负责质量评估、测试、回归。',
  color: '#4f6b52'
}
```

### 2. 修改分组

最常改的是：

- `label`
- `description`
- `color`

### 3. 删除分组

删除前先确认没有节点仍然引用这个 `groupId`。

## 六、文档和源码链接怎么放

当前策略是：

1. 如果这个概念已经在 VitePress 里有正式文档，优先用 `docLink()`
2. 只有在 **还没有对应站内文档** 时，才用 `sourceFile()`
3. 源码入口优先放进 `examples`；`docs` 这一栏尽量保持“文档优先、源码兜底”

例子：

```ts
docs: [
  docLink('RAG 概念文档', '/agents/foundation/19-rag')
]
```

### 什么时候用 `sourceFile()`

因为这会直接跳到你的 GitHub 仓库源码：

`https://github.com/Fridolph/AI-Journey-Fighting/blob/main/...`

它更适合这些场景：

- 这个概念还没有整理进 VitePress
- 你当前更想把入口指向 demo、实验文件或草稿
- 这个概念的最佳解释就在源码里，而不是在正式文档里

## 七、推荐维护流程

每次学一个新主题，建议按这个顺序维护：

1. 先在 `drafts/<category>/` 记录学习过程
2. 确认这个概念属于哪个分组
3. 在 `conceptNodes` 新增节点
4. 在 `conceptLinks` 补上和已有概念的关系
5. 先检查站内是否已经有对应文档：
   有的话优先挂 `docLink()`；没有的话再挂 `sourceFile()`
6. 打开 `/agents/concept-map/` 肉眼检查布局

## 八、常见问题

### 1. 为什么桌面端正常，手机端像列表？

这是刻意设计的。
桌面端用坐标图，手机端自动切成纵向卡片，避免小屏里节点重叠和文字不可读。

### 2. 如果两个节点重叠了怎么办？

优先调 `x / y`，不要先改组件样式。
因为重叠多数是数据布局问题，不是组件能力问题。

### 3. 如果一个概念还没有文档怎么办？

直接用 `sourceFile()` 指向 GitHub 里的源码、草稿或测试文件即可。

### 4. 如果一个概念既有文档又有源码呢？

优先把站内文档放进 `docs`，源码放进 `examples`。
这样地图右侧详情会更清晰：

- `docs`
  用来承接正式学习路径
- `examples`
  用来承接源码、实验文件、草稿和测试样例

## 九、当前入口

- 地图页：[AI 学习概念地图](./)
- 数据源：[aiConceptMap.ts](https://github.com/Fridolph/AI-Journey-Fighting/blob/main/docs/.vitepress/data/aiConceptMap.ts)
