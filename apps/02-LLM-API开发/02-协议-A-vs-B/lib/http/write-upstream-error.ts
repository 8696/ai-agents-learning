/**
 * 职责：上游 SDK 抛错 → HTTP JSON；SSE 开流前也能直接写 res。
 * 数据流：unknown err → { error, upstreamStatus }；已开 SSE 时只能写错误帧，改不了状态码。
 */
import type { Context } from "koa";
import type { ServerResponse } from "node:http";

export function describeUpstreamError(err: unknown): {
  message: string;
  upstreamStatus?: number;
} {
  const message = err instanceof Error ? err.message : String(err);
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status?: unknown }).status === "number"
  ) {
    return { message, upstreamStatus: (err as { status: number }).status };
  }
  return { message };
}

export function writeUpstreamError(
  ctx: Context,
  err: unknown,
  extraBody: Record<string, unknown> = {},
): void {
  const { message, upstreamStatus } = describeUpstreamError(err);
  ctx.status = upstreamStatus ?? 500;
  ctx.body = { error: message, upstreamStatus: upstreamStatus ?? null, ...extraBody };
}

/** ctx.respond=false 时 koa 不会发 ctx.body，必须自己 writeHead。 */
export function writeJsonResponse(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/** SSE 开流前写 JSON；已经 writeHead 之后只能再塞一帧 error。 */
export function writeSseOrJsonError(res: ServerResponse, err: unknown): void {
  const { message, upstreamStatus } = describeUpstreamError(err);
  if (!res.headersSent) {
    writeJsonResponse(res, upstreamStatus ?? 500, { error: message });
    return;
  }
  try {
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  } catch {
    /* 对端已断开 */
  }
}
