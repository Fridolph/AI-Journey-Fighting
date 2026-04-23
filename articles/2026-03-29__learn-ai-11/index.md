---
layout: post
title: 「JS全栈AI学习」十一、Multi-Agent 系统设计：可观测性与生产实践
date: 2026-04-06
tags:
  - Multi-Agent
  - AI Agent
  - TypeScript
  - 可观测性
  - 系统设计
categories:
  - AI
---

> 📌 **系列简介**：「JS全栈AI学习」记录 AI 应用开发的完整学习过程，篇数随进度持续更新。
> *前端转 JS 全栈，正在学 AI，理解难免有偏差，欢迎批评指正 ~*

---

## 写在前面

前两篇把 Multi-Agent 系统从"能跑"做到了"跑得稳"——架构选型、动态编排、成本优化、容错降级。

> 九、十、十一 3篇对应学习的 第15章：Multi-Agent 系统架构、第16章：工作流编排与规划、第17章：成本优化与执行策略
> 很多孤立起来说没意义，加上 multi-agent 比较重要就放一起了
> 这里的例子可理解为 AI 给我的作业，实际只有思路，并没有真的跑起来实际业务 ~ 仅供参考

但有一天，用户投诉：

> "为什么给我推荐的酒店这么贵？我明明说了预算有限！"

我想回答这个问题，却发现：
- NLU Agent 是怎么理解"预算有限"的？**不知道**
- Profile Agent 推断的用户类型是什么？**不知道**
- Planner Agent 为什么选了这个酒店档次？**不知道**
- 整个流程耗时多久？哪个环节最慢？**不知道**

系统变成了一个黑盒。

这让我意识到：**能跑、跑得稳，还不够——还要看得见。**

可观测性（Observability）不是锦上添花，是生产级系统的必备能力。

这篇是 Multi-Agent 系列的最后一篇，聚焦三件事：**日志、链路追踪、决策解释**，以及一些生产环境的实践经验。

---

## 目录

1. [可观测性的三大支柱](#1-可观测性的三大支柱)
2. [日志设计](#2-日志设计)
3. [链路追踪](#3-链路追踪)
4. [决策解释](#4-决策解释)
5. [性能监控与告警](#5-性能监控与告警)
6. [生产环境实践](#6-生产环境实践)
7. [完整框架串联](#7-完整框架串联)
8. [系列总结](#8-系列总结)

---

## 1. 可观测性的三大支柱

可观测性不是单一的技术，而是三个维度的结合：

```
Logs（日志）    → 回答"某个时刻，系统的状态是什么？"
Traces（链路）  → 回答"一个请求经过了哪些 Agent？每个环节耗时多久？"
Metrics（指标） → 回答"系统整体表现如何？有没有异常？"
```

三者缺一不可：
- 只有日志，能看到事件，但看不到全局路径
- 只有链路，能看到路径，但看不到细节
- 只有指标，能看到趋势，但定位不了具体问题

---

## 2. 日志设计

### 结构化日志

先看两种日志的对比：

```typescript
// ❌ 非结构化：格式不统一，无法关联请求，难以分析
console.log("Flight Agent started querying flights for Beijing");

// ✅ 结构化：可按字段查询，可聚合分析，可追踪到具体请求
logger.info({
  timestamp: "2026-04-06T22:45:30.123Z",
  level: "INFO",
  traceId: "req_abc123",   // 关键：把这条日志和请求绑定
  agentId: "flight_agent",
  action: "query_flights_start",
  context: { destination: "北京", budget: 5000 },
});
```

结构化日志最关键的字段是 **traceId**——它把一个请求的所有日志串联起来，是后续链路追踪的基础。

### 记录哪些节点？

不是所有代码都需要日志，关键是抓住**四个节点**：

```typescript
class ObservableAgent {
  async execute(context: Context): Promise<Result> {
    const startTime = Date.now();

    // 1. Agent 开始
    logger.info({ traceId, agentId, action: 'agent_start' });

    try {
      // 2. 外部 API 调用前后（记录耗时）
      logger.debug({ traceId, agentId, action: 'api_call_start', api: 'flight_api' });
      const result = await this.callExternalAPI();
      logger.debug({ traceId, agentId, action: 'api_call_done', count: result.length });

      // 3. 决策点（最重要！记录为什么选这个）
      const selected = this.selectBestOption(result);
      logger.info({
        traceId, agentId, action: 'decision_made',
        selected: selected.id,
        reason: '价格最优，在预算范围内',
      });

      // 4. Agent 完成
      logger.info({ traceId, agentId, action: 'agent_complete', duration: Date.now() - startTime });
      return selected;

    } catch (error) {
      // 5. 错误（单独捕获，带完整上下文）
      logger.error({ traceId, agentId, action: 'agent_error', error, duration: Date.now() - startTime });
      throw error;
    }
  }
}
```

决策点的日志是最容易被忽略的，也是最有价值的——它回答了"为什么得到这个结果"，是后面决策解释的数据来源。

### 日志级别

```
DEBUG → 详细调试信息（只在开发环境开启）
INFO  → 关键节点和决策点（生产环境的基准）
WARN  → 使用了降级策略、潜在问题
ERROR → 异常和错误
```

生产环境用 INFO 级别，不要用 DEBUG——否则日志量会爆炸，反而找不到有用的信息。

---

## 3. 链路追踪

日志告诉我们"发生了什么"，但看不到"完整的路径"。这就需要链路追踪。

### 核心概念：Trace 和 Span

```
Trace：一个完整的请求链路（从用户发起到返回结果）
Span：链路中的一个环节（每个 Agent 的执行是一个 Span）

Trace
  └─ Span（Coordinator）
       ├─ Span（NLU Agent）
       ├─ Span（Planner Agent）
       └─ Span（并行查询）
            ├─ Span（Flight Agent）
            ├─ Span（Hotel Agent）
            └─ Span（Attraction Agent）
```

Span 之间有父子关系，通过 `parentSpanId` 连接。

### TraceId 的传递

TraceId 要在所有 Agent 间传递，这是链路追踪的核心：

```typescript
class Coordinator {
  async execute(userInput: string): Promise<Result> {
    const traceId = generateTraceId(); // 在入口生成，全程传递
    const rootSpan = tracer.startSpan({ traceId, agentId: 'coordinator' });

    // 调用其他 Agent 时，传递 traceId 和 parentSpanId
    const intent = await this.nluAgent.execute({
      userInput,
      traceId,
      parentSpanId: rootSpan.spanId, // NLU 的 Span 挂在 Coordinator 下面
    });

    tracer.endSpan(rootSpan);
    return result;
  }
}
```

### 可视化链路

有了 Trace 数据，就能可视化整个请求路径：

```
Coordinator          ████████████████████████████████ 5000ms
  NLU Agent          ████ 400ms
  Planner Agent      ████ 400ms
  Flight Agent       ████████████████████████ 2300ms  ← 性能瓶颈
  Hotel Agent        █████████████████ 1700ms
  Attraction Agent   █████████ 900ms
```

一眼就能看出：Flight Agent 是瓶颈，占了总耗时的 46%。

这是我在做前端性能优化时就熟悉的思路——**先找到最慢的那个，再想怎么优化**。在 Multi-Agent 里，工具换了，逻辑是一样的。

---

## 4. 决策解释

这是这篇里我觉得最有价值的部分。

AI 系统最大的"黑盒"问题，不是技术上看不到，而是**用户不知道为什么得到这个结果**。

### 记录决策依据

每次做决策，都记录下来：选了什么、有哪些选项、为什么选这个：

```typescript
class ExplainableHotelAgent {
  async selectHotel(hotels: Hotel[], context: Context): Promise<Hotel> {
    // 对每个酒店打分，记录各维度的权重和影响
    const scored = hotels.map(hotel => ({
      hotel,
      score: this.calculateScore(hotel, context),
      factors: [
        { name: '价格',  weight: 0.4, impact: this.priceFit(hotel.price, context.budget) },
        { name: '位置',  weight: 0.3, impact: this.locationScore(hotel.distanceToCenter) },
        { name: '评分',  weight: 0.2, impact: hotel.rating / 5 },
        { name: '设施',  weight: 0.1, impact: this.facilityScore(hotel.facilities) },
      ],
    }));

    const best = scored.sort((a, b) => b.score - a.score)[0];

    // 记录决策（这条记录是后续解释的数据来源）
    decisionLog.record({
      agentId: 'hotel_agent',
      action: 'select_hotel',
      options: hotels.length,
      selected: best.hotel.id,
      factors: best.factors,
      reason: this.buildExplanation(best),
    });

    return best.hotel;
  }
}
```

### 展示给用户

当用户问"为什么推荐这个酒店"时，直接从决策记录里取：

```
📊 推荐理由 · 三亚某酒店

1. 价格：500元/晚（权重 40%）
   预算 5000元 / 4晚 = 1250元/晚上限，500元在范围内，性价比高

2. 位置：距海滩 200m（权重 30%）
   符合您的偏好：海边度假

3. 评分：4.8 / 5.0（权重 20%）
   基于 1234 条用户评价

综合得分：8.7 / 10
```

这就把黑盒变成了白盒——用户看得见推荐的依据，信任感自然建立起来。

---

## 5. 性能监控与告警

### 关键指标

监控系统健康，最重要的三个维度：

```
延迟（Latency）  → P50 / P95 / P99，而不是平均值
成功率           → 成功请求 / 总请求
错误率           → 失败请求 / 总请求
```

**为什么关注 P95/P99，而不是平均值？**

平均值会被极端值拉偏。P95 表示"95% 的请求在这个时间内完成"——更能反映真实的用户体验。
如果 P95 是 5 秒，说明有 5% 的用户每次都在等 5 秒以上，这是真实的问题。

### 告警规则

指标异常时自动触发告警：

```typescript
const alertRules = [
  {
    name: '错误率过高',
    condition: (m: Metrics) => m.errorRate > 0.1,       // 错误率 > 10%
    severity: 'critical',
  },
  {
    name: '响应过慢',
    condition: (m: Metrics) => m.latency.p95 > 5000,    // P95 > 5s
    severity: 'warning',
  },
];
```

告警不是越多越好——告警太多会让人麻木，反而忽略真正重要的问题。
只对真正需要人工介入的情况告警，其他的记录日志就够了。

---

## 6. 生产环境实践

几个踩过坑之后总结的原则：

### 日志级别按环境区分

```
开发环境 → DEBUG（记录所有细节，方便调试）
测试环境 → INFO（记录关键节点）
生产环境 → WARN（只记录警告和错误）
```

### 敏感信息脱敏

日志里不能出现密码、Token、信用卡号——写入之前统一过滤：

```typescript
private sanitize(entry: LogEntry): LogEntry {
  const sensitiveFields = ['password', 'token', 'creditCard'];
  sensitiveFields.forEach(field => {
    if (entry.context?.[field]) entry.context[field] = '***';
  });
  return entry;
}
```

这一条看起来简单，但在实际项目里很容易漏——建议在日志框架层统一处理，不要依赖各处手动过滤。

### 采样策略

高流量系统不需要记录所有请求的 Trace，否则存储成本会很高：

```typescript
shouldTrace(context: Context): boolean {
  if (Math.random() < 0.1)      return true;  // 随机采样 10%
  if (context.hasError)          return true;  // 错误请求 100% 采样
  if (context.duration > 5000)   return true;  // 慢请求 100% 采样
  return false;
}
```

正常请求采样 10%，错误和慢请求 100% 采样——既能监控系统，又不产生海量数据。

### 推荐工具组合

```
日志查询    → Elasticsearch + Kibana
链路追踪    → Jaeger 或 Zipkin
指标监控    → Prometheus + Grafana
```

这三个组合是目前业界最常见的可观测性技术栈，文档完善，生态成熟。

---

## 7. 完整框架串联

把日志、链路、指标整合成一个可观测性框架，用装饰器模式包装 Agent——业务代码不需要改动：

```typescript
class ObservabilityFramework {
  // 包装任意 Agent，自动注入可观测性能力
  wrapAgent(agent: Agent): Agent {
    return {
      execute: async (context: Context): Promise<Result> => {
        const startTime = Date.now();
        const span = tracer.startSpan({ traceId: context.traceId, agentId: agent.id });

        logger.info({ traceId: context.traceId, agentId: agent.id, action: 'agent_start' });

        try {
          const result = await agent.execute(context);
          const duration = Date.now() - startTime;

          logger.info({ traceId: context.traceId, agentId: agent.id, action: 'agent_complete', duration });
          metrics.record(agent.id, duration, true);
          tracer.endSpan(span);

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;

          logger.error({ traceId: context.traceId, agentId: agent.id, action: 'agent_error', error, duration });
          metrics.record(agent.id, duration, false);

          // 检查是否需要告警
          const m = metrics.get(agent.id);
          if (m.errorRate > 0.1) alertManager.send({ severity: 'critical', agentId: agent.id });

          tracer.endSpan(span);
          throw error;
        }
      },
    };
  }
}

// 使用：一行代码，Agent 自动具备完整的可观测性
const flightAgent  = observability.wrapAgent(rawFlightAgent);
const hotelAgent   = observability.wrapAgent(rawHotelAgent);
```

装饰器模式在这里很合适——可观测性是横切关注点，不应该和业务逻辑耦合在一起。

---

## 8. 系列总结

三篇写完了，回头看一下这条路：

```
第一篇：架构与编排
  → 中心化 vs 去中心化，动态主导权转移，版本控制

第二篇：成本优化与容错
  → 两阶段执行，用户画像，断路器 + 降级 + Saga 补偿

第三篇：可观测性与生产实践
  → 日志 + 链路 + 指标，决策解释，生产环境实践
```

这三篇其实是同一件事的三个层次：

- **第一篇**解决的是"怎么让多个 Agent 有序协作"
- **第二篇**解决的是"出了问题怎么办，怎么省钱"
- **第三篇**解决的是"怎么知道系统在做什么，出了问题怎么找"

顺序不是随意的——先能跑，再跑得稳，再看得见。

---

## 写在最后

学这一章的时候，有一个问题一直在脑子里转：

**为什么可观测性这么重要？**

技术上的答案是：系统复杂了，靠直觉和经验已经不够，需要数据。

但我觉得还有一个更深的原因——

AI 系统做决策，用户看不见过程，只看到结果。
如果结果不符合预期，用户没有办法理解为什么，也没有办法信任这个系统。

可观测性，本质上是在建立**信任**。

不只是让工程师能调试，更是让用户能理解——"系统是怎么想的，为什么给我这个结果"。

易经里有一卦叫**明夷卦**，卦象是"明入地中"——光明藏入地下，看不见了。
但明夷卦的卦辞说："利艰贞。"——在晦暗中，更要坚守正道，内心清明。

系统复杂到像一个黑盒，这是"明入地中"。
可观测性要做的，就是把那道光重新引出来——让内部的运行逻辑，能够被看见、被理解、被信任。

内文明，而外可观。

---

*昇哥 · 2026年4月*
*Multi-Agent 系统设计系列完结，下一个话题待定*