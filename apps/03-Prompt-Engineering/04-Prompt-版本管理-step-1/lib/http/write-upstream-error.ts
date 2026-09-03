/**
 * 职责：把上游 LLM SDK 抛出的异常翻译成形状固定的 HTTP 错误响应。
 * 数据流：unknown err → ctx.status + { error, upstreamStatus }。
 */
import type { Context } from "koa";

export function writeUpstreamError(
  ctx: Context,
  err: unknown,
  extraBody: Record<string, unknown> = {},
): void {
  const message = err instanceof Error ? err.message : String(err);
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
