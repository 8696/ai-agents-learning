/**
 * 职责：给一次函数 / 模型调用补齐五条日志（开始+入参+源码 / 结束+返回值+耗时）。
 */
import { logger } from "../logger.js";

export function maskSecret(text: string): string {
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

export async function withCall<T>(opts: {
  scope: string;
  kind: "函数" | "模型" | "HTTP";
  name: string;
  explain: string;
  args: unknown;
  code: string;
  run: () => Promise<T>;
}): Promise<T> {
  const started = Date.now();
  const prefix =
    opts.kind === "模型" ? "调用模型" : opts.kind === "HTTP" ? "调用HTTP" : "调用函数";
  logger.info(opts.scope, `${prefix}开始：${opts.name}`, opts.explain, {
    入参: opts.args,
    __code: opts.code,
  });
  try {
    const result = await opts.run();
    logger.info(opts.scope, `${prefix}结束：${opts.name}`, "本次调用走完，下面是完整返回值。", {
      返回值: result,
      耗时ms: Date.now() - started,
    });
    return result;
  } catch (error: unknown) {
    logger.error(opts.scope, `${prefix}结束：${opts.name}（失败）`, "这次调用失败，返回值是错误对象。", {
      返回值: error,
      耗时ms: Date.now() - started,
    });
    throw error;
  }
}