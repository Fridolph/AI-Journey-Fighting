/**
 * 语义检索请求体 —— Zod Schema 版
 *
 * @remarks
 * 对照 TypeORM 版的 `conversations/dto/semantic-search.dto.ts`：
 *
 * | | TypeORM 版 | 本文件（Zod） |
 * |--|-----------|--------------|
 * | 形态 | 一个 class | 一个 schema 对象 + 派生类型 |
 * | 类型定义 | TS 类型（编译期消失） | `z.infer` 从 schema 推导 |
 * | 运行时校验 | 无（或靠 class-validator） | **schema 自带** |
 * | 单一数据源 | 类型和校验分两处写 | schema 一处写，类型自动推导 |
 *
 * **Zod 的核心价值**：schema 既是「运行时校验规则」又是「TS 类型的来源」，
 * 两者永远同步，不会出现「类型改了忘了改校验」的典型事故。
 *
 * 用法上，controller 里配合 {@link ZodValidationPipe}：
 * ```ts
 * @Post(':id/search')
 * search(@Body(new ZodValidationPipe(semanticSearchSchema)) dto: SemanticSearchDto) {}
 * ```
 */

import { z } from 'zod';

/**
 * 语义检索请求体 schema
 *
 * @remarks
 * 逐字段说明：
 * - `query`：必填字符串。`min(1)` 拦住空串（避免把空字符串送去向量化，
 *   既浪费一次 API 调用，语义检索也没有意义）
 * - `limit`：可选整数。`int()` 拦截 `3.5` 这类值，`min(1)`/`max(50)` 限制范围
 *   ——`max(50)` 是刻意的**上界保护**：limit 过大会让向量检索返回海量行，
 *   拖慢响应、抬高数据库负载
 * - `.optional()` 表示该字段可以完全不传
 */
export const semanticSearchSchema = z.object({
  query: z.string().min(1, 'query 不能为空'),
  limit: z.number().int().min(1).max(50).optional(),
});

/**
 * 从 schema 推导出的 TS 类型
 *
 * @remarks
 * `z.infer<>` 是 Zod 的「类型推导」能力：
 * 类型定义不再是手写的 interface/class，而是**从校验规则自动算出来**。
 *
 * 等价于手写：
 * ```ts
 * interface SemanticSearchDto {
 *   query: string;
 *   limit?: number;
 * }
 * ```
 * 但好处是：改了上面的 schema，这个类型自动跟着变，绝不会忘记同步。
 */
export type SemanticSearchDto = z.infer<typeof semanticSearchSchema>;
