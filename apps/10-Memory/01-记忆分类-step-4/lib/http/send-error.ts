/**
 * 职责：把 4xx / 5xx 写成统一 JSON，不依赖 koa.Context 类型（P-016）。
 * 数据流：路由读 jsonBody → 校验失败或业务失败 → sendError({ status, body }, …)。
 */

export function jsonBody(ctx: { request: object }): unknown {
  return (ctx.request as { body?: unknown }).body;
}

export function sendError(
  ctx: { status: number; body: unknown },
  status: number,
  body: { error: string; explain: string },
): void {
  ctx.status = status;
  ctx.body = body;
}