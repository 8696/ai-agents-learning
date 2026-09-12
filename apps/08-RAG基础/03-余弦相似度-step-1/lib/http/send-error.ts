/**
 * 职责：给路由写 HTTP 错误体。入参不用 koa.Context，避开两套类型打架（P-016）。
 *
 * 数据流：路由算出 status + body → 写到 ctx.status / ctx.body。
 */
export function sendError(
  ctx: { status: number; body: unknown },
  status: number,
  body: unknown,
): void {
  ctx.status = status;
  ctx.body = body;
}
