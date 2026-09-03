/**
 * 职责：把上游 LLM SDK 抛出的异常翻译成一份形状固定的 HTTP 错误响应。
 * 数据流：unknown err → ctx.status（上游有 status 就用上游的，否则 500）+ { error, upstreamStatus }。
 * 为什么单独成文件：classify 两侧都失败时要走同一套形状，页面才能用同一个分支显示 429 / 500。
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
