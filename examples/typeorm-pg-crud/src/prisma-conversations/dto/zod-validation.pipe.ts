/**
 * ZodValidationPipe —— 用 Zod schema 校验请求参数的通用管道
 *
 * @remarks
 * **为什么需要这个文件？** NestJS 原生不认 Zod。
 * 官方支持的是 class-validator（装饰器风格），要是用 Zod 就得自己接一根管道。
 *
 * ## 管道（Pipe）在 NestJS 里的位置
 *
 * ```text
 * 请求 → Controller → [Pipe: 转换/校验] → 方法参数
 * ```
 * 校验失败的请求会在进 Controller 方法体**之前**就被拦下返回 400，
 * 业务代码永远拿到的是「已经确认合法」的数据。
 *
 * ## 泛型设计
 *
 * `T extends ZodTypeAny` 让这个管道能复用于**任意** schema——
 * 传什么 schema，`transform` 出来的类型就跟着变（类型安全）。
 *
 * ```ts
 * new ZodValidationPipe(semanticSearchSchema)  // T = 语义检索的 shape
 * new ZodValidationPipe(createUserSchema)      // 复用同一管道
 * ```
 *
 * ## 与 TypeORM 版的对比
 *
 * TypeORM 版的 DTO 是「裸 class」，运行时不做任何校验——
 * `@Body() dto` 拿到什么就是什么，传 `{"query": 123}` 也不会报错，
 * 一路传到数据库才出问题。
 *
 * 这里用 Zod 把校验前移到了入口处，这是更健壮的工程实践。
 */
import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ZodTypeAny } from 'zod';

@Injectable()
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform {
  /**
   * @param schema - 任意 Zod schema
   */
  constructor(private readonly schema: T) {}

  /**
   * 校验并转换入参
   *
   * @param value - 待校验的原始值（这里是请求体）
   * @param _metadata - NestJS 传入的参数元信息（本管道用不到）
   * @returns 校验通过后的数据（类型已收窄，多余字段被剔除）
   * @throws BadRequestException 校验失败时抛出 400，附具体字段错误
   *
   * @remarks
   * `safeParse` vs `parse`：
   * - `parse` 失败时直接抛 ZodError，异常类型不符合 HTTP 语义
   * - `safeParse` 返回 `{ success, error }`，由我们决定抛什么异常
   *
   * 这里选 `safeParse`，以便把 Zod 的字段级错误信息原样转成 400 响应体，
   * 前端能拿到「哪个字段错了、为什么错」。
   */
  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      // 把 Zod 的 issues 数组直接作为响应体，便于调试
      throw new BadRequestException({
        message: '请求参数校验失败',
        errors: result.error.issues,
      });
    }

    // 返回解析后的数据：多余字段已被 Zod 剔除，类型也已收窄
    return result.data;
  }
}
