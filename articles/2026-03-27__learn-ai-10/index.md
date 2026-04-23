---
layout: post
title: 「JS全栈AI学习」十、Multi-Agent 系统设计：成本优化与容错机制
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

上一篇我们把 Multi-Agent 系统跑起来了——架构选了中心化，编排用了动态主导权转移，状态管理加了版本控制。

但系统能跑，不代表系统好用。

跑起来之后，新的问题随之而来：

- **成本**：每次都调用所有 Agent，LLM API 费用太高
- **体验**：用户等了 10 秒才看到结果，体验很差
- **可靠性**：Flight Agent 调用失败了，整个系统就崩溃了

这篇聚焦这三个问题：**怎么省钱、怎么让用户等得舒服、怎么让系统不那么脆**。

> 九、十、十一 3篇对应学习的 第15章：Multi-Agent 系统架构、第16章：工作流编排与规划、第17章：成本优化与执行策略
> 很多孤立起来说没意义，加上 multi-agent 比较重要就放一起了
> 这里的例子可理解为 AI 给我的作业，实际只有思路，并没有真的跑起来实际业务 ~ 仅供参考

---

## 目录

1. [两阶段执行模型](#1-两阶段执行模型)
2. [用户画像驱动的智能估算](#2-用户画像驱动的智能估算)
3. [异常处理与容错机制](#3-异常处理与容错机制)
4. [完整的容错流程](#4-完整的容错流程)
5. [总结](#5-总结)

---

## 1. 两阶段执行模型

### 问题

先看一个典型的执行流程：

```
NLU Agent     → 理解意图     （LLM 调用，~1s）
Profile Agent → 分析画像     （LLM 调用，~1s）
Planner Agent → 制定计划     （LLM 调用，~1s）
↓ 并行
Flight Agent  → 查询航班     （外部 API，2-3s）
Hotel Agent   → 查询酒店     （外部 API，2-3s）
Attraction    → 查询景点     （外部 API，1-2s）
```

总计 5-8 秒，用户盯着加载圈等。

更糟糕的是：**查完发现超预算，用户不满意，前面的工作全白做了。**

### 解法：先估算，再执行

思路很简单——把执行分成两个阶段：

**阶段一（1-2 秒）**：只用 LLM 做推理，不调用外部 API，给用户一个快速预估。
用户看到预估，觉得合适，再进入阶段二。

**阶段二（5-8 秒）**：用户确认后，才执行精确查询。

```typescript
class TwoPhaseExecution {
  async plan(userInput: string): Promise<TravelPlan> {
    // 阶段一：快速预估（只用 LLM，不调外部 API）
    const estimation = await this.quickEstimation(userInput);
    await this.showEstimation(estimation);
    // 展示："预估费用 4500-5500 元，包含往返机票、3 晚住宿、主要景点"

    const confirmed = await this.askUser("预估方案如何？是否继续查询详细信息？");
    if (!confirmed) return null; // 用户不满意，省下了后续所有 API 调用

    // 阶段二：精确执行
    return await this.detailedExecution(estimation);
  }
}
```

这个改动看起来简单，但效果很明显：
- 用户 1-2 秒就能看到结果，不是盯着空白等
- 如果预估不满意，直接调整，省下了 5-8 秒的查询时间和 API 费用
- 用户确认后再执行，体验更主动

### 估算怎么做？

估算不是瞎猜，而是基于历史数据 + 规则：

```typescript
estimateFlightPrice(intent: Intent): PriceRange {
  const historical = this.historicalData.getFlightPrices(intent.route, intent.month);
  const seasonFactor  = this.getSeasonFactor(intent.travelDate);   // 旺季 1.3x，春节 1.5x
  const advanceFactor = this.getAdvanceFactor(intent.advanceDays); // 提前 30 天 0.9x，临时 1.3x

  const base = historical.median * seasonFactor * advanceFactor;
  return { min: base * 0.8, max: base * 1.2, confidence: 0.85 };
}
```

季节因素、提前预订时间、历史中位数——三个变量组合，估算置信度能到 85% 左右，足够让用户做初步判断。

---

## 2. 用户画像驱动的智能估算

### 从预算反推用户类型

用户说"预算 5000 元"，这个数字背后有很多信息。

我的思路是：**从预算反推用户类型，再从用户类型推断偏好**。

```typescript
inferUserType(intent: Intent): UserProfile {
  const dailyBudget = intent.budget / intent.duration; // 人均日预算

  const userType =
    dailyBudget < 500  ? 'budget_traveler'   : // 穷游
    dailyBudget < 1000 ? 'standard_traveler' : // 标准
    dailyBudget < 2000 ? 'comfort_traveler'  : // 舒适
                         'luxury_traveler';     // 奢华

  return {
    userType,
    preferences: this.getDefaultPreferences(userType),
    // budget_traveler  → 经济舱 + 三星酒店 + 公共交通
    // luxury_traveler  → 商务舱 + 五星酒店 + 专车
  };
}
```

这样做的好处是：不需要问用户"你喜欢住几星的酒店"，直接从预算推断，减少打扰。

### 多信号融合与冲突处理

除了预算，还可以融合其他信号：用户历史行为、用户明确表达的偏好。

但有时候信号会冲突——比如预算说穷游，但用户要求五星酒店。

我的处理原则是：**尊重用户的明确表达，但温和提示冲突**。

```typescript
// 优先级：用户明确说的 > 历史行为 > 预算推断
const priority = ['explicit', 'history', 'budget'];

// 发现冲突时，不强制，而是温和提示
this.notifyUser({
  message: "您的预算是 5000 元，但选择了五星酒店，可能会超出预算。是否调整？",
  suggestions: [
    "降低酒店档次，控制在预算内",
    "保持五星酒店，预算调整为 8000 元",
    "继续当前选择，我会尽量优化其他方面",
  ],
});
```

注意这里的措辞：**不是"您的预算不够，必须选三星酒店"，而是"可能会超出预算，是否调整？"**

把选择权留给用户。技术要谦卑，产品要克制。

---

## 3. 异常处理与容错机制

系统不可能永远正常运行。问题不是"会不会出错"，而是"出错了怎么办"。

### 重试策略：指数退避

对于临时性故障（网络抖动、服务过载），重试是最简单的方案。
但重试不能立即重试——如果服务过载，立即重试只会加剧问题。

**指数退避**：等待时间逐渐增加（1s → 2s → 4s），给服务恢复的机会：

```typescript
async executeWithRetry<T>(fn: () => Promise<T>, config: RetryConfig): Promise<T> {
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!this.isRetryable(error) || attempt === config.maxAttempts) throw error;

      const delay = Math.min(
        config.initialDelay * Math.pow(2, attempt - 1), // 指数增长
        config.maxDelay
      );
      await this.sleep(delay);
    }
  }
}

// 可重试：网络超时、服务过载（503/429）
// 不可重试：参数错误、认证失败
```

### 断路器：快速失败

如果服务持续失败，继续调用只是浪费时间。不如暂时"熔断"：

```
CLOSED（正常）→ 失败 5 次 → OPEN（熔断，直接拒绝调用）
                                  ↓ 等待 60 秒
                             HALF_OPEN（尝试恢复）
                                  ↓ 成功 2 次
                               CLOSED（恢复）
```

断路器的核心价值：**在服务不可用时，快速失败，不让请求堆积**。

```typescript
async execute<T>(fn: () => Promise<T>): Promise<T> {
  if (this.state === 'OPEN') {
    // 超过冷却时间，尝试半开
    if (Date.now() - this.lastFailureTime > this.config.timeout) {
      this.state = 'HALF_OPEN';
    } else {
      throw new Error('Circuit breaker is OPEN'); // 快速失败
    }
  }

  try {
    const result = await fn();
    this.onSuccess(); // 成功：重置计数，可能关闭断路器
    return result;
  } catch (error) {
    this.onFailure(); // 失败：累计计数，可能打开断路器
    throw error;
  }
}
```

### 降级策略：多层兜底

主方案失败了，还可以用备用方案。关键是**提前想好每一层的兜底**：

```
Level 0：实时 API 查询（最准确）
  ↓ 失败
Level 1：缓存数据（可能过期，但有数据）
  ↓ 失败
Level 2：历史数据（价格区间，不是精确值）
  ↓ 失败
Level 3：默认估算（保底，总比崩溃好）
```

每一层降级都要告知用户，不能悄悄降级然后给出一个用户不知道来源的结果。

### 补偿机制：Saga 模式

有些操作需要"撤销"——比如预订了机票，但酒店预订失败了，需要取消机票。

这就是 **Saga 模式**：每个操作都有对应的补偿操作，失败时反向执行：

```typescript
// 正向：预订机票 → 预订酒店
// 补偿：取消酒店 → 取消机票（反向）

await saga.execute([
  {
    name: '预订机票',
    execute:    async () => await bookFlight(),
    compensate: async () => await cancelFlight(), // 补偿操作
  },
  {
    name: '预订酒店',
    execute:    async () => await bookHotel(),
    compensate: async () => await cancelHotel(),
  },
]);
// 如果"预订酒店"失败，自动调用"取消机票"，保证数据一致性
```

Saga 模式解决的是**分布式事务**的问题——多个服务之间没有统一的事务管理器，只能靠补偿来保证最终一致性。

### 用户通知：透明但不打扰

出了问题，怎么告知用户？

我的原则是：**重要的通知，不重要的静默处理；通知时提供选择，不甩锅**。

```
认证失败（critical）  → 必须告知，需要用户决策
服务超时（warning）   → 告知，但提供备用方案
使用缓存（info）      → 静默处理，不打扰
```

比如航班查询失败，不要说"系统错误，请稍后重试"（甩锅），而是：

```
航班实时信息暂时不可用（航空公司 API 响应超时）

为您提供以下选择：
1. 使用历史价格估算（基于过去 30 天，区间 1000-2000 元）
2. 等待服务恢复后重试（预计 5-10 分钟）
3. 先规划目的地行程，稍后单独查询航班

请选择您希望的方式 😊
```

说明原因，提供方案，把决策权交给用户。

---

## 4. 完整的容错流程

把上面的策略组合起来，形成三层防御：

```typescript
async execute(context: Context): Promise<Result> {
  try {
    // 第一层：断路器（快速失败，不让请求堆积）
    return await this.circuitBreaker.execute(async () =>
      // 第二层：重试（处理临时故障）
      await this.retryStrategy.executeWithRetry(
        () => this.doWork(context),
        { maxAttempts: 3, initialDelay: 1000, maxDelay: 10000 }
      )
    );
  } catch (error) {
    // 第三层：降级（备用方案）
    try {
      const fallback = await this.fallbackStrategy.execute(context);
      await this.notifyUser({ level: 'warning', message: '使用了备用方案，结果可能不是最新的' });
      return fallback;
    } catch {
      // 降级也失败了，通知用户介入
      await this.notifyUser({ level: 'error', message: '服务暂时不可用，请稍后重试' });
      throw error;
    }
  }
}
```

```
断路器  → 快速失败，保护下游
  ↓
重试    → 处理临时故障
  ↓
降级    → 备用方案兜底
  ↓
通知    → 人工介入
```

每一层都有明确的职责，不重叠，不遗漏。

---

## 5. 总结

### 成本优化的核心思路

**不要盲目执行，先想清楚用户真正需要什么。**

两阶段执行解决的不只是成本问题，更是用户体验问题——让用户尽早参与决策，而不是等系统跑完再问"满意吗"。

### 容错机制的核心思路

**系统不可能永远正常，但可以优雅地处理异常。**

重试 → 断路器 → 降级 → 通知，这四层防御的顺序是有意义的：
- 先尝试自己解决（重试）
- 再快速止损（断路器）
- 再找备用方案（降级）
- 最后才打扰用户（通知）

### 产品哲学

技术实现之外，这篇让我想清楚了一件事：

**系统出错时，最容易犯的错误是"甩锅"——把问题推给用户，让用户自己想办法。**

好的容错设计应该是：说清楚发生了什么，提供可选的方案，把决策权交给用户。
不是"系统错误"，而是"发生了什么、有哪些选择、你来决定"。

这是技术上的容错，也是产品上的诚信。

---

## 写在最后

学这一章的时候，有一个地方让我停下来想了一下。

降级策略那里，每一层失败了，都还有下一层兜底——实时数据 → 缓存 → 历史数据 → 默认估算。
系统不会因为一个环节出错就彻底崩溃，它会找到当下能做的事，继续往前走。

易经里有一卦叫**未济卦**，是六十四卦的最后一卦。

很多人以为"既济"（事情完成）才是终点，但易经把"未济"（事情未完成）放在最后——
未济卦的卦辞说："未济，亨。"——事情还没完成，但依然通畅。

这不是说残缺是好事，而是说：**事情永远有未完成的部分，系统永远有可能出错，这是常态，不是例外。**
真正的健壮，不是永不出错，而是出错了还能继续走。

容错机制，说的就是这件事。

---

*昇哥 · 2026年4月*