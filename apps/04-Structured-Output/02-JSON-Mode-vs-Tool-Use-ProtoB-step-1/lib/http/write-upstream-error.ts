/**
 * 职责：把上游 LLM SDK 抛错写成 HTTP 响应。
 * 数据流：unknown err → ctx.status（有 status 用上游码，否则 500）+ { error, upstreamStatus }。
 * 为什么：route 里不要各自 if/else 猜 status。Anthropic SDK 抛错也带 .status。
 */
import type { Context } from "koa";

export function writeUpstreamError(
  ctx: Context,
  err: unknown,
  extraBody: Record<string, unknown> = {},
): void {
  const msg = err instanceof Error ? err.message : String(err);
  const upstreamStatus =
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : undefined;
  ctx.status = upstreamStatus ?? 500;
  ctx.body = { error: msg, upstreamStatus: upstreamStatus ?? null, ...extraBody };
}
