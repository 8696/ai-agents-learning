/**
 * 职责：把 4xx / 5xx 写成页面能读的 JSON。
 * 数据流：status + 给人看的 error 句 → ctx.body。
 */
import type { Context } from "koa";

export function sendError(
  ctx: Context,
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
): void {
  ctx.status = status;
  ctx.body = { ok: false, error, ...extra };
}
