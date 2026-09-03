/**
 * 职责：把上游 LLM SDK 抛出的异常翻译成一份形状固定的 HTTP 错误响应。
 * 数据流：unknown err → ctx.status（上游有 status 就用上游的，否则 500）+ { error, upstreamStatus }。
 * 为什么单独成文件：三个 route 都要写这段；散着写会各自猜 status，
 *   页面就没法用同一个分支显示「这是 429 限流还是 500 服务端错」。
 */
import type { Context } from "koa";

export function writeUpstreamError(
  ctx: Context,
  err: unknown,
  extraBody: Record<string, unknown> = {},
): void {
  const message = err instanceof Error ? err.message : String(err);

  // OpenAI SDK 的 APIError 带 status；用 in 判断而不是 instanceof，
  // 免得为了一个字段把 SDK 的错误类型 import 进来（网关自定义错误也可能带 status）。
  const upstreamStatus =
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : undefined;

  ctx.status = upstreamStatus ?? 500;
  ctx.body = { error: message, upstreamStatus: upstreamStatus ?? null, ...extraBody };
}
