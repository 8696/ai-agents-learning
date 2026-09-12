/**
 * 职责：给一次函数调用补齐五条日志（开始+入参+源码 / 结束+返回值+耗时）。
 *
 * 数据流：打开始 → 跑 fn → 打结束；失败打「结束（失败）」仍带返回值（错误对象）。
 */
import { logger } from "../logger.js";

export async function withCall<T>(opts: {
  scope: string;
  name: string;
  explainStart: string;
  explainEnd: string;
  入参: unknown;
  __code: string;
  字段释义?: Record<string, string>;
  fn: () => T | Promise<T>;
}): Promise<T> {
  const started = Date.now();
  logger.info(opts.scope, `调用函数开始：${opts.name}`, opts.explainStart, {
    入参: opts.入参,
    __code: opts.__code,
  });
  try {
    const result = await opts.fn();
    logger.info(opts.scope, `调用函数结束：${opts.name}`, opts.explainEnd, {
      返回值: result,
      耗时ms: Date.now() - started,
      ...(opts.字段释义 ? { 字段释义: opts.字段释义 } : {}),
    });
    return result;
  } catch (error: unknown) {
    logger.error(opts.scope, `调用函数结束：${opts.name}（失败）`, opts.explainEnd, {
      返回值: error,
      耗时ms: Date.now() - started,
    });
    throw error;
  }
}
