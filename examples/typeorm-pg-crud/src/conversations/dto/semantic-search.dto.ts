/**
 * 语义检索请求体
 *
 * @remarks
 * 当前是**纯类型声明**（无运行时校验）：类型只存在于编译期，
 * 请求体传什么运行时都会照单全收。
 *
 * 如需运行时校验，有两种常见做法：
 * 1. **class-validator**（NestJS 传统方案）
 *    ```ts
 *    @IsString() @IsNotEmpty() query: string;
 *    @IsOptional() @IsInt() @Min(1) @Max(50) limit?: number;
 *    ```
 *    配合 `app.useGlobalPipes(new ValidationPipe())` 生效。
 * 2. **Zod**（本仓库 Prisma 版采用）
 *    用 Zod schema 定义结构，再用自定义 Pipe 校验 —— 类型定义和运行时校验合一，
 *    且能从 schema 推导出 TS 类型（`z.infer<typeof schema>`），避免两处维护。
 *
 * @see `examples/typeorm-pg-crud/src/prisma-conversations/` 的 Zod 版对照实现
 */
export class SemanticSearchDto {
  /** 搜索词（自然语言），用于向量化后做相似度匹配 */
  query: string;

  /** 返回条数上限；不传则按 URL 查询串或默认值 5 处理 */
  limit?: number;
}
