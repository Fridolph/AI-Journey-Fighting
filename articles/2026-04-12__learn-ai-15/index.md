# 二十一、从零推导 Agent 工作机制

> 📌 **系列简介**：「JS全栈AI Agent学习」系统学习 AI Agent 设计模式，篇数随学习进度持续更新。
> 📖 **原书地址**：[adp.xindoo.xyz](https://adp.xindoo.xyz/)
> *前端转 JS 全栈，正在学 AI，理解难免有偏差，欢迎批评指正 ~*

---

## 写在前面

> 同样使用苏格拉底式学习法，伪代码是把思路理清楚了，让AI生成的，仅供参考

**Agent 到底是什么？**

不是定义上的，是机制上的：它和一个普通的 LLM 调用，到底差在哪里？

这一章我没有去查资料，而是盯着这个问题，
从"一个 LLM 缺什么才变不成 Agent"开始，
一个一个往下推。

推着推着，推出了一套完整的工作机制。

---

## 一、Agent 和 LLM，到底差在哪？

我最开始以为，Agent 就是"会用工具的 LLM"。

但仔细想，这个说法不够准确。

一个普通的 LLM 对话是这样的：

```
用户问 → LLM 答 → 结束
```

每次对话都是独立的。它不记得你上次说了什么，不会主动找你，不会自己去查资料，也不会反思自己答得对不对。

而一个 Agent，应该能做到：

```
感知环境 → 决策 → 执行 → 观察结果 → 再决策 → ...
```

这是一个**持续运转的闭环**，不是一问一答。

那么，要让 LLM 变成 Agent，需要补哪些东西？

我从"缺什么"开始往下推。

---

## 二、第一件事：它记不住

LLM 天生没有记忆。每次调用都是全新的开始。

这件事在做简单对话时感觉不出来，但一旦 Agent 要持续工作——
记住用户说过什么、自己做过什么、哪些事情做成了哪些失败了——
没有记忆，什么都做不了。

所以第一个要补的，是 **Memory（记忆）**。

但我一开始的想法太粗糙了——把所有对话存起来不就行了？

后来发现不行。那样 Context 会无限膨胀，越积越臃肿，
到最后每次调用都要把一本书塞进去，既慢又贵，还容易干扰推理。

真正的 Memory 机制是有取舍的——每一条记录都带权重，权重低的逐渐淡出：

```typescript
// 写入记忆：每条记录带权重
async function writeMemory(entry: {
  content: string
  importance: 'high' | 'medium' | 'low'  // 重要性标记
}) {
  const weight = {
    high: 1.0,    // 用户明确强调的
    medium: 0.6,  // 普通交互
    low: 0.3,     // 背景信息
  }[entry.importance]

  await db.insert('memories', {
    content: entry.content,
    weight,
    created_at: Date.now(),
  })
}

// 召回记忆：只取相关度超过阈值的
async function recallMemory(query: string): Promise<string[]> {
  const allMemories = await db.query('memories')

  return allMemories
    .map(m => ({
      ...m,
      // 时间衰减：越久远权重越低
      decayedWeight: m.weight * Math.exp(-0.01 * daysSince(m.created_at)),
      // 语义相关度
      relevance: cosineSimilarity(embed(query), embed(m.content)),
    }))
    .filter(m => m.decayedWeight > 0.2 && m.relevance > 0.7) // 双阈值过滤
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5)  // 最多召回 5 条，不撑爆 Context
    .map(m => m.content)
}
```

存得少，但存得准。
每次召回的，都是真正和当前任务相关的那几条。

---

## 三、第二件事：它不会主动醒来

有了 Memory，Agent 能记住事了。

但我很快意识到另一个问题——**谁来叫醒它？**

LLM 是被动的，有人问才有人答。
但很多 Agent 场景需要主动触发：
每天早上 8 点生成日报、监控到异常立刻告警、用户长时间未回复主动跟进……

这些都不是"等用户问"能解决的。

所以还需要 **Trigger（触发器）**：

```typescript
class AgentTriggerManager {
  // 定时触发：每天 8 点生成日报
  registerCron(expression: string, task: AgentTask) {
    cron.schedule(expression, () => this.agent.run(task))
  }

  // 事件触发：订单失败时立刻响应
  registerEvent(eventName: string, task: AgentTask) {
    eventBus.on(eventName, (payload) => this.agent.run({ ...task, payload }))
  }

  // 条件触发：置信度超过阈值时执行
  registerCondition(
    check: () => Promise<boolean>,
    task: AgentTask,
    intervalMs = 60_000  // 每分钟检查一次
  ) {
    setInterval(async () => {
      if (await check()) this.agent.run(task)
    }, intervalMs)
  }
}

// 使用
const triggers = new AgentTriggerManager(resumeAgent)

triggers.registerCron('0 8 * * *', { type: 'daily_report' })
triggers.registerEvent('order_failed', { type: 'handle_failure' })
triggers.registerCondition(
  async () => (await getConfidenceScore()) > 0.8,
  { type: 'auto_optimize' }
)
```

有了 Trigger，Agent 才能从"被动响应"变成"主动感知"。

---

## 四、第三件事：它只会说，不会做

Agent 能记住事，能主动醒来，但光靠 LLM 自身，它只能输出文字。

查数据库？调接口？发邮件？写文件？——都做不到。

所以还需要 **Tool Use（工具调用）**。

工具调用的设计我觉得很优雅——LLM 不直接执行，只负责"决定用什么工具、传什么参数"，执行权在外部：

```typescript
// 第一步：定义工具，告诉 LLM 有哪些工具可以用
const tools = [
  {
    name: 'query_resume',
    description: '从简历知识库中检索相关内容',
    parameters: {
      query: { type: 'string', description: '检索关键词' }
    },
  },
  {
    name: 'search_market',
    description: '搜索当前市场薪资行情',
    parameters: {
      keyword: { type: 'string', description: '职位关键词' },
      city: { type: 'string', description: '城市' },
    },
  },
  {
    name: 'update_resume',
    description: '更新简历中的某个字段',
    parameters: {
      field: { type: 'string' },
      value: { type: 'string' },
    },
  },
]

// 第二步：LLM 决策要用哪个工具
const response = await llm.chat({
  messages: [{ role: 'user', content: '帮我优化简历里的项目描述' }],
  tools,  // 把工具列表传给 LLM
})

// LLM 返回的不是文字，而是工具调用指令：
// { tool: "query_resume", params: { query: "项目描述" } }

// 第三步：执行工具，把结果注回 Context
if (response.tool_call) {
  const result = await executeTool(response.tool_call)
  // 把执行结果塞回去，让 LLM 继续推理
  messages.push({ role: 'tool', content: JSON.stringify(result) })
}
```

工具可以无限扩展，LLM 本身不需要改变。
想加新能力，加工具就行，不用动模型。

---

## 五、拼起来之后，还差一环

现在 Agent 有了 Memory、Trigger、Tool Use。

我以为这就够了。

但写着写着，我发现一个没想到的问题——

**Agent 怎么知道自己做对了？**

工具调用返回了结果，这个结果是否符合预期？
如果不符合，要怎么调整？

如果 Agent 只是"执行 → 输出"，没有自我校验，
那它和一个写死的脚本没有本质区别。

这里需要一个反思闭环：**ReAct**。

ReAct = Reasoning（推理）+ Acting（行动）的循环：

```typescript
async function reactLoop(goal: string, maxSteps = 10) {
  const context = {
    goal,
    memory: await recallMemory(goal),  // 先召回相关记忆
    steps: [] as StepRecord[],
  }

  for (let step = 0; step < maxSteps; step++) {
    // Reasoning：推理下一步该做什么
    const thought = await llm.reason({
      goal: context.goal,
      history: context.steps,
      instruction: '分析当前状态，决定下一步行动。如果目标已达成，返回 DONE。',
    })

    if (thought.action === 'DONE') {
      console.log(`目标达成，共 ${step + 1} 步`)
      break
    }

    // Acting：执行工具
    const result = await executeTool(thought.action)

    // Observe：观察结果，判断是否符合预期
    const observation = await llm.evaluate({
      expected: thought.expected,  // LLM 预期的结果
      actual: result,              // 实际结果
    })

    context.steps.push({
      step,
      thought: thought.reasoning,
      action: thought.action,
      result,
      // 不符合预期时，记录偏差原因，下一轮推理时参考
      deviation: observation.matched ? null : observation.reason,
    })

    // 不符合预期 → 下一轮重新推理，调整策略
    // 符合预期   → 继续下一步
  }

  // 把这次执行结果写回记忆
  await writeMemory({
    content: `目标"${goal}"的执行过程：${JSON.stringify(context.steps)}`,
    importance: 'medium',
  })
}
```

有一个反直觉的现象值得记一下：
越靠近目标，反而越容易偏离。

比如写代码的 Agent，越到最后几步，越容易因为"差一点就好了"而过度修改，引入新 bug。
ReAct 的价值就在于：**每一步都重新审视，不让惯性带着跑。**

---

## 六、完整的 Agent 架构

把上面推导出来的每一块拼在一起：

```
外部事件 / 定时器
      ↓
Trigger（触发器）
      ↓
LLM Core（推理核心）
  ├── 从 Memory 召回相关上下文
  ├── 结合当前输入，推理决策
  └── 输出：文字 or 工具调用指令
      ↓
Tool Use（工具执行层）
  ├── 查数据库
  ├── 调外部 API
  └── 写入文件 / 发送通知
      ↓
ReAct Loop（反思闭环）
  ├── 观察执行结果
  ├── 是否符合预期？
  └── 不符合 → 重新推理
      ↓
Memory（写回记忆）
  └── 本次执行结果，按权重存入
```

每一块都是被一个"缺了会怎样"的问题逼出来的，不是为了架构完整而凑的。

---

## 七、感知"快出事了"

架构搭好了，我想到一个新问题——

**Agent 什么时候该介入？**

明显的异常好判断：订单失败、接口报错、数据为空——直接触发。

但有一类情况更难处理：**问题还没发生，但苗头已经出现了。**

比如：
- 用户投诉率从 2% 涨到了 3%，还在正常范围内，但在持续上升
- 某个接口响应时间从 200ms 涨到了 350ms，没超阈值，但趋势不对
- 一个大客户，最近登录频率明显下降

这些信号，单独看都不触发告警。但放在一起，是在说：**有什么东西正在变坏。**

这叫做 **Weak Signal Detection（弱信号检测）**。

读到这里，我想起坤卦初六的一句爻辞，觉得说的就是这件事——

"履霜，坚冰至。"

踩到薄霜的时候，就该知道：坚冰要来了。
不是等到坚冰来了才反应，是在薄霜出现的时候就开始准备。

工程上怎么实现？不是等单个指标超阈值，而是**观察趋势和组合**：

```
单指标阈值检测（传统告警）
→ 投诉率 > 5% 才告警

弱信号检测
→ 投诉率连续 3 天上升，即使当前只有 3%，也触发关注
→ 投诉率上升 + 响应时间上升 + 大客户活跃度下降，组合触发
```

把多个微弱信号叠加，比等待单一强信号，早得多。

---

## 八、自己决定，还是问人？

弱信号检测触发了，Agent 下一步怎么办？

这里有一个我一直没想清楚的问题：**什么时候 Agent 自己处理，什么时候要拉人进来？**

完全自动化有风险——Agent 判断失误，没有人兜底。
什么都问人又没意义——那还要 Agent 干什么。

解法是 **Human-in-the-Loop（人机协同）**，核心是**阈值分层**：

```
置信度 > 90%   → Agent 自主执行，事后记录日志
置信度 60~90%  → Agent 执行，但实时通知人类，可随时干预
置信度 < 60%   → 暂停，等待人类决策后再继续
```

阈值不是 AI 自己定的，是**人类根据业务风险设定的**。

高风险操作（写入、删除、付款）阈值设高；
低风险操作（查询、生成草稿）阈值设低。

这个设计有一个我觉得很重要的副作用：**它保留了人类的校准权。**

Agent 的判断会有偏差，人类介入的每一次，都是一次纠偏。
系统越跑越准，不是因为模型变了，是因为人类一直在校准边界。

---

## 九、走已知的路，还是探索新的路？

有了人机协同，Agent 的决策质量有了保障。

但还有一个维度，我是学到强化学习那一节才意识到的——

**Agent 应该一直走已经验证过的路，还是去探索没走过的路？**

这是强化学习里一个经典的矛盾：

> **Exploitation vs Exploration**
> 利用（已知最优）vs 探索（未知可能）

举个具体的例子：

一个客服 Agent，已经知道"回复模板 A"能解决 80% 的投诉。
- **纯 Exploitation**：永远用模板 A，稳定但上限固定，遇到新类型投诉就束手无策。
- **纯 Exploration**：每次都随机尝试新方法，可能发现更好的解法，但也可能把用户搞得更烦。

两个极端都不对。

实际的做法是**动态平衡**：

```
大多数时候（比如 90%）→ 走已知最优路径（Exploitation）
小部分时候（比如 10%）→ 尝试新策略，观察效果（Exploration）
```

这个比例不是固定的，可以根据环境变化调整：
- 系统稳定、风险低 → 适当提高 Exploration 比例，主动寻找更优解
- 系统不稳定、风险高 → 压低 Exploration，优先保证稳定性

一个只会利用的 Agent，会越来越僵化。
一个只会探索的 Agent，永远无法收敛。
真正好用的，是在两者之间找到动态平衡点的那个。

---

## 十、推理过程本身，也是一种记忆

推到最后，我想到一个更深的问题。

前面说 Memory 存的是"做了什么、结果怎样"。
但 Agent 在推理过程中，其实还产生了另一类信息——

**中间的思考步骤。**

比如 Agent 在解决一个复杂问题时，内部推理链可能是这样的：

```
"用户说响应慢 → 可能是数据库查询慢 → 检查慢查询日志
→ 发现某个 SQL 没走索引 → 根因是上周新加的字段没建索引
→ 解决方案：补建索引 + 通知开发同学"
```

这个推理链，是**隐式的**——它在 LLM 的 Context 里存在，但不会自动写入 Memory。

下次遇到类似问题，Agent 又得从头推一遍。

**Latent Reasoning → Memory，说的就是：把这些隐式的推理过程，显式地存下来。**

```typescript
// 普通的存法：只存结论
await writeMemory({
  content: '响应慢的根因是缺少索引，解决方案是补建索引',
  importance: 'medium',
})

// 更好的存法：连推理路径一起存
await writeMemory({
  content: JSON.stringify({
    conclusion: '响应慢的根因是缺少索引',
    reasoning_chain: [
      '用户反馈响应慢',
      '怀疑是数据库查询慢',
      '检查慢查询日志，发现 SQL 未命中索引',
      '追溯到上周新增字段未建索引',
    ],
    solution: '补建索引 + 通知开发同学',
    // 下次遇到"响应慢"类问题，直接从第二步开始推
    reusable_from_step: 1,
  }),
  importance: 'high',
})

// 召回时，不只拿结论，连推理路径一起拿
async function recallWithReasoning(query: string) {
  const memories = await recallMemory(query)
  // 如果召回的记忆里有推理链，直接注入 Context
  // LLM 可以从"上次想到哪了"继续，跳过重复推导
  return memories.map(m => {
    try {
      const parsed = JSON.parse(m)
      return parsed.reasoning_chain
        ? `[已有推理路径]\n${parsed.reasoning_chain.join(' → ')}\n结论：${parsed.conclusion}`
        : m
    } catch {
      return m
    }
  })
}
```

存结论，是记住了做了什么。
存推理路径，是记住了怎么想到这么做的。

前者是结果，后者是经验。

---

## 写在最后

把这一章推导下来，我意识到一件事——

Agent 的每一个组件，都不是凭空设计出来的。
都是因为"没有它，Agent 会在某个地方卡住"。

Memory 是因为记不住，Trigger 是因为叫不醒，
Tool Use 是因为只会说不会做，ReAct 是因为做完了不知道对不对……

**从缺陷出发，比从架构出发，理解得更扎实。**

> 学得虽然迷迷糊糊，也算是半只脚入门了吧？这个系列断断续续快2月，总算是啃下来了。
> 
> 接下来开启实战篇章。

---

*昇哥 · 2026年4月*
*学 Agent 工作机制途中，把想清楚的事写下来*