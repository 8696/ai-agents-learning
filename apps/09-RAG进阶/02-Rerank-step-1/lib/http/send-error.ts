/**
 * 职责：把校验失败 / 业务失败写成页面能分开看的 HTTP 错误。
 * 入参不用 koa.Context：@koa/router 自带另一份 @types/koa，两套 Context 对不上。
 */
type ErrorCtx = {
  status: number;
  body: unknown;
};

export class HttpError extends Error {
  readonly status: number;
  readonly hint: string;

  constructor(status: number, message: string, hint: string) {
    super(message);
    this.status = status;
    this.hint = hint;
  }
}

export function jsonBody(ctx: { request: object }): unknown {
  const req = ctx.request as { body?: unknown };
  return req.body ?? {};
}

export function sendError(ctx: ErrorCtx, error: unknown): void {
  if (error instanceof HttpError) {
    ctx.status = error.status;
    ctx.body = { ok: false, error: error.message, hint: error.hint };
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  ctx.status = 500;
  ctx.body = { ok: false, error: message, hint: "服务端未分类错误" };
}