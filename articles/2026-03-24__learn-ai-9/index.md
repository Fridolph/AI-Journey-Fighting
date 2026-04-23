---
layout: post
title: 「JS全栈AI学习」九、Multi-Agent 系统设计：架构与编排
date: 2026-04-06
tags:
  - Multi-Agent
  - AI Agent
  - TypeScript
  - 系统设计
categories:
  - AI
---

> 📌 **系列简介**：「JS全栈AI Agent学习」系统学习 21 个 Agent 设计模式，篇数随学习进度持续更新。
> 📖 **原书地址**：[adp.xindoo.xyz](https://adp.xindoo.xyz/)
> *前端转 JS 全栈，正在学 AI，理解难免有偏差，欢迎批评指正 ~*

---

## 写在前面

这个系列前几篇，我们从 RAG 开始——把简历切片、向量化、检索，让 AI 能"翻书再答题"。
再到 A2A 协议——搞清楚多个 Agent 之间怎么互相发现、互相协作、互相信任。

但学到这里，我意识到还有一个问题没解决：

**Agent 之间协作，谁来指挥？谁来编排？出了问题谁来兜底？**

这就是 Multi-Agent 系统设计要回答的问题。

这篇是这个话题的第一篇，聚焦在三件事：**架构选择、动态编排、状态管理**。
用"旅行规划"这个场景贯穿始终——不是因为它特别，而是因为它足够复杂，能把问题说清楚。

> 九、十、十一 3篇对应学习的 第15章：Multi-Agent 系统架构、第16章：工作流编排与规划、第17章：成本优化与执行策略
> 很多孤立起来说没意义，加上 multi-agent 比较重要就放一起了

---

## 目录

1. [为什么需要 Multi-Agent？](#1-为什么需要-multi-agent)
2. [架构设计：中心化 vs 去中心化](#2-架构设计中心化-vs-去中心化)
3. [动态工作流编排](#3-动态工作流编排)
4. [上下文管理](#4-上下文管理)
5. [状态管理与一致性](#5-状态管理与一致性)
6. [Human-in-the-loop](#6-human-in-the-loop)
7. [完整流程串联](#7-完整流程串联)
8. [总结](#8-总结)

[Multi-Agent 系统设计](./Multi-Agent.png)

---

## 1. 为什么需要 Multi-Agent？

### 单 Agent 的局限

假设用户说："帮我规划一次去三亚的旅行，预算 5000 元。"

如果用单个 Agent 处理，它需要同时具备：理解意图、查航班、查酒店、查景点、规划路线、计算预算……

这些能力混在一起，代码会变得臃肿且难以维护。更重要的是，每个环节都有专业知识和外部 API，单个 Agent 很难做到精通所有领域。

### 分工协作的思路

借鉴现实世界的分工，我们可以设计多个专业的 Agent，各司其职：

```
NLU Agent      → 理解用户意图
Profile Agent  → 分析用户偏好
Planner Agent  → 制定整体计划
Flight Agent   → 查询航班信息
Hotel Agent    → 查询酒店信息
```

好处很直接：
- **职责清晰**：每个 Agent 只做一件事，做好一件事
- **易于维护**：修改航班查询逻辑，只需要改 Flight Agent
- **可复用**：Flight Agent 可以用在其他旅行相关场景

这和前面学 A2A 时的思路是一脉相承的——A2A 解决的是 Agent 之间"怎么通信"，Multi-Agent 设计解决的是"怎么协作"。

---

## 2. 架构设计：中心化 vs 去中心化

Multi-Agent 系统有两种常见的架构模式，选哪个，取决于场景。

### 中心化架构（Coordinator 模式）

有一个中心协调者（Coordinator）负责调度所有 Agent：

```typescript
class Coordinator {
  async execute(userInput: string): Promise<Result> {
    // 串行：理解意图 → 分析画像 → 制定计划
    const intent   = await this.agents.nlu.execute({ userInput });
    const profile  = await this.agents.profile.execute({ intent });
    const plan     = await this.agents.planner.execute({ intent, profile });

    // 并行：同时查询航班、酒店、景点
    const [flights, hotels, attractions] = await Promise.all([
      this.agents.flight.execute({ plan }),
      this.agents.hotel.execute({ plan }),
      this.agents.attraction.execute({ plan }),
    ]);

    return this.integrate({ flights, hotels, attractions });
  }
}
```

流程清晰，统一的错误处理和状态管理，便于调试——代价是 Coordinator 是单点，压力大。

### 去中心化架构（P2P 模式）

Agent 之间通过消息总线直接通信，没有中心协调者：

```typescript
// Flight Agent 完成后，发布事件，其他 Agent 自行订阅响应
class FlightAgent {
  async execute(context: Context): Promise<Result> {
    const result = await this.queryFlights(context);
    this.messageBus.publish({ type: 'flights_ready', data: result });
    return result;
  }
}
```

没有单点瓶颈，扩展性好——代价是流程不直观，调试困难。

### 我的选择

对于旅行规划这种有明确步骤的场景，我选择了**中心化架构**。

原因很简单：旅行规划有清晰的先后顺序（理解意图 → 制定计划 → 查询信息 → 整合结果），需要强一致性（预算控制不能各个 Agent 各自为政），也需要便于调试。

如果是实时监控、事件驱动的场景，去中心化可能更合适。**架构没有对错，只有合不合适。**

---

## 3. 动态工作流编排

有了架构，接下来的问题是：如何编排这些 Agent 的执行顺序？

### 静态编排的问题

最简单的方式是写死流程——但太死板了：
- 如果用户直接说"帮我订明天去北京的机票"，还需要分析画像吗？
- 如果用户已经订好了酒店，还需要查询酒店吗？

### 动态主导权转移

我想到一个思路：**让 Agent 自己决定下一步该谁执行**。

就像接力赛，当前跑的人决定把棒交给谁——流程就灵活了：

```typescript
class Agent {
  async execute(context: Context): Promise<ExecutionResult> {
    const result = await this.doWork(context);

    // 根据当前状态，决定把主导权交给谁
    const nextAgent = this.decideNextAgent(context, result);

    return { result, nextAgent, context: this.updateContext(context, result) };
  }

  private decideNextAgent(context: Context, result: any): string | null {
    if (context.needsFlightInfo && !context.hasFlightInfo) return 'flight_agent';
    if (context.needsHotelInfo  && !context.hasHotelInfo)  return 'hotel_agent';
    return null; // 没有下一步了
  }
}
```

Coordinator 只需要不断传递主导权，直到没有下一步：

```typescript
class DynamicCoordinator {
  async execute(userInput: string): Promise<Result> {
    let context     = this.initContext(userInput);
    let currentAgent = 'nlu_agent';

    while (currentAgent) {
      const { result, nextAgent, context: newContext } =
        await this.agents.get(currentAgent).execute(context);

      context      = newContext;
      currentAgent = nextAgent; // 主导权转移
    }

    return context.finalResult;
  }
}
```

这个思路让我想起乾卦的"时乘六龙以御天"——不是死守固定的步骤，而是顺应时机，动态调整。

### 充分条件原则

动态编排带来一个新问题：Agent 怎么知道自己能不能执行？

我的答案是：**定义每个 Agent 的前置条件，条件不满足就反向补全**。

```typescript
class FlightAgent {
  canExecute(context: Context): boolean {
    return context.has('destination') &&
           context.has('departureCity') &&
           context.has('travelDate');
  }

  async execute(context: Context): Promise<Result> {
    const missing = this.checkMissing(context);

    if (missing.length > 0) {
      // 反向传播：请求 NLU Agent 补全缺失信息
      context.requestInfo(missing);
      return { status: 'pending', nextAgent: 'nlu_agent' };
    }

    return await this.queryFlights(context);
  }
}
```

这就像神经网络的反向传播：从目标反推需要什么输入，然后向前传播补全信息。

---

## 4. 上下文管理

多个 Agent 协作，必然涉及信息共享。Context 的设计很关键。

### 上下文的结构

```typescript
interface Context {
  requestId: string;
  traceId: string;       // 链路追踪

  user: { id: string; preferences: UserPreferences };

  intent: Intent;
  destination: string;
  budget: number;

  completedAgents: string[];
  results: Map<string, any>;
}
```

### 只传递必要的信息

不是所有信息都需要传递。我的原则是：**每个 Agent 只提取自己需要的，只返回必要的结果**。

```typescript
class FlightAgent {
  async execute(context: Context): Promise<Result> {
    // 只提取需要的字段
    const { destination, departureCity, travelDate, budget } = context;

    const flights = await this.queryFlights({
      destination, departureCity, travelDate,
      maxPrice: budget * 0.4,  // 航班预算占总预算 40%
    });

    // 只返回必要的结果，不把原始数据全部往下传
    return {
      flights: flights.slice(0, 5),
      cheapestPrice: flights[0].price,
      recommendedFlight: this.selectBest(flights),
    };
  }
}
```

信息过载和信息不足一样危险——这是做 RAG 时就踩过的坑，在 Multi-Agent 里同样成立。

---

## 5. 状态管理与一致性

当多个 Agent 并行执行时，会遇到状态一致性问题。

### 问题场景

```
t0: 用户说"预算 5000 元"
t1: Flight Agent 和 Hotel Agent 同时开始查询（基于 5000 元）
t2: 用户说"我想把预算改成 8000 元"
问题：Flight Agent 已经查完了，结果还有效吗？
```

### 版本控制

解决方案：给上下文加**版本号**。

```typescript
class StateManager {
  private version = 0;

  // 更新上下文时，版本号递增
  updateContext(updates: Partial<Context>): void {
    this.version++;
    this.context = { ...this.context, ...updates, version: this.version };
  }

  // Agent 开始执行时，创建快照（记录当前版本）
  createSnapshot(agentId: string): ContextSnapshot {
    return { version: this.version, context: { ...this.context }, agentId };
  }

  // Agent 提交结果时，检查版本是否一致
  submitResult(agentId: string, result: any, snapshotVersion: number): boolean {
    if (snapshotVersion < this.version) {
      console.log(`${agentId} 的结果已过期，需要重新执行`);
      return false;
    }
    return true;
  }
}
```

### 乐观锁 vs 悲观锁

对于状态冲突，有两种策略：

- **乐观锁**：先执行，提交时检查版本——适合读多写少的场景（查询航班）
- **悲观锁**：先加锁，执行完再释放——适合写操作（预订机票）

我的选择是**混合策略**：查询用乐观锁，性能高；预订用悲观锁，保证一致性。

这个思路和数据库事务设计是一回事——底层的逻辑，跨越了层次，是相通的。

---

## 6. Human-in-the-loop

完全自动化不一定是最好的。有时候，让用户参与决策反而更好。

### 最小干预原则

我的原则是：**只在关键决策点询问用户，其他信息能推断就推断，能用默认值就用默认值**。

```typescript
class ProgressiveConfirmation {
  async execute(userInput: string): Promise<Result> {
    const intent = await this.nluAgent.execute({ userInput });

    // 只问缺失的关键信息
    if (!intent.destination) {
      intent.destination = await this.askUser("您想去哪里？");
    }

    // 非关键信息：推断或使用默认值
    intent.budget     = intent.budget     || this.inferBudget(intent);
    intent.travelDate = intent.travelDate || this.getDefaultDate();

    // 非关键信息在后续流程中再问，不要一次性问完
    return this.continueExecution(intent);
  }
}
```

一次性问用户十个问题，用户会直接关掉。**逐步确认，每次只问最关键的那一个。**

### 何时必须让用户介入？

回顾前面学 A2A 时总结的四种情况，在 Multi-Agent 编排里同样适用：

1. **权限/能力边界**：Agent 遇到了自己无权处理的事
2. **死锁/僵局**：系统自己解不开
3. **高风险不可逆操作**：预订、付款、发送——做了就很难撤回
4. **置信度低于阈值**：Agent 不够确定，不该自己做主

---

## 7. 完整流程串联

把上面的思路串起来，看一个完整的执行流程：

```typescript
class TravelPlanningSystem {
  async plan(userInput: string): Promise<TravelPlan> {
    // 1. 初始化上下文
    const context = { traceId: generateId(), version: 0, userInput, results: new Map() };

    // 2. NLU → 补全缺失信息 → Profile → Planner（串行）
    const intent = await this.nluAgent.execute(context);
    if (!intent.destination) {
      intent.destination = await this.askUser("您想去哪里？");
    }
    context.intent  = intent;
    context.profile = await this.profileAgent.execute(context);
    context.plan    = await this.plannerAgent.execute(context);

    // 3. 并行查询（带版本快照）
    const snapshot = this.stateManager.createSnapshot('parallel_query');
    const [flights, hotels, attractions] = await Promise.all([
      this.flightAgent.execute(snapshot.context),
      this.hotelAgent.execute(snapshot.context),
      this.attractionAgent.execute(snapshot.context),
    ]);

    // 4. 检查版本冲突（用户可能中途修改了预算）
    if (snapshot.version < this.stateManager.currentVersion) {
      return this.plan(userInput); // 重新规划
    }

    // 5. 整合结果
    return this.integrate({ flights, hotels, attractions, plan: context.plan });
  }
}
```

流程里有几个细节值得注意：
- 串行和并行混用——有依赖关系的步骤串行，独立的步骤并行
- 版本快照在并行开始前创建，不是在结束后
- 版本冲突时直接重新规划，不是尝试修补

---

## 8. 总结

### 这篇学到的几个判断

**架构选择没有对错，只有合不合适。**
有明确流程的场景用中心化，事件驱动的场景用去中心化。

**动态编排比静态编排更灵活，但更难调试。**
主导权转移的思路很好，但要做好链路追踪，不然出了问题很难定位。

**充分条件原则是 Multi-Agent 设计的基础。**
每个 Agent 都应该知道自己需要什么、能做什么、做不了的时候该怎么办。

**状态一致性是并行执行的核心挑战。**
版本控制 + 混合锁策略，是目前我觉得最实用的解法。

### 和前面内容的关系

回头看这个系列走过的路：

```
RAG          → 让 Agent 能"翻书再答题"（知识检索）
A2A 协议     → 让 Agent 之间能互相发现、协作、信任（通信协议）
Multi-Agent  → 让多个 Agent 能有序地协同完成复杂任务（编排调度）
```

每一层都在解决上一层留下的问题。

---

## 写在最后

学这一章的时候，有一个细节让我停下来想了一下。

动态主导权转移那里，每个 Agent 在执行完之后，都要做一个判断：**下一步该谁？**

不是由外部强行指定，而是由当前执行者根据现状来决定。

这让我想起易经里的一个说法：**"知几其神乎"**——几，是事物变化的苗头，是时机的信号。
真正懂得顺势而为的人，不是按计划行事，而是在每一个当下，感知现状，做出最合适的那个判断。

Multi-Agent 的动态编排，其实是在用代码实现这件事：
不是写死流程，而是让每个节点都有感知、有判断、有选择。

系统如此，人也如此。

---

*昇哥 · 2026年4月*
*学 Multi-Agent 系统设计途中，把想清楚的事写下来*