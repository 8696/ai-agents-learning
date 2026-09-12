/**
 * 职责：从请求对象拿出 JSON body，不 import koa.Context。
 *
 * 数据流：bodyParser 已挂上 request.body → 原样返回给路由做 zod 校验。
 */
export function jsonBody(ctx: { request: object }): unknown {
  return (ctx.request as { body?: unknown }).body;
}
