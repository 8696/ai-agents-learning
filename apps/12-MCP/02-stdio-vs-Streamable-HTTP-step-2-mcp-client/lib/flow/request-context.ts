/**
 * 职责：把「请求级 token」从 koa route 层传到持久 transport 的 dynamicAuthFetch。
 *
 * 数据流：
 *   浏览器 → fetch("/api/http/...", { headers: { Authorization: "Bearer ..." } })
 *     → routes/http-*.ts handler
 *       → runWithRequestContext({ token: 解析出来的 token }, async () => {
 *           const result = await callTool(name, args);
 *           ctx.body = { ok: true, result };
 *         })
 *     → SDK callTool 内部 → 走 fetch(url, init)
 *       → dynamicAuthFetch(input, init)
 *         → getCurrentRequestToken() → 读 ALS 当前 store
 *         → 拼 Authorization 头
 *
 * 为什么用 AsyncLocalStorage：持久 transport 只需要一个（连接复用），
 * 但 token 每次请求都不同。ALS 是 Node 22 内置的「请求级状态」原语——
 * 每次 run() 创建独立 store，并发请求互不干扰，不在模块顶层留状态。
 *
 * 为什么单独成文件：本文件只持有 ALS 实例 + 两个 helper（run / get）；
 * 不混进 mcp-http-client.ts，避免「请求级 token」和「连接管理」两个职责揉一起。
 */
import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  /** 从 koa 来的 Authorization: Bearer ... 解出的 token；null 表示无 token */
  token: string | null;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * 在请求上下文里跑 fn。fn 内部所有 async 调用都看得到这个 token。
 * route handler 模板：
 *   runWithRequestContext({ token: extractBearer(...) }, () => handler(ctx))
 */
export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return requestContext.run(ctx, fn);
}

/**
 * 给 dynamicAuthFetch 读当前请求的 token。无 token 时返 null（不带头）。
 */
export function getCurrentRequestToken(): string | null {
  return requestContext.getStore()?.token ?? null;
}

/**
 * 给 route handler 用：从 Authorization 头里解 Bearer token。
 * 无 Authorization 头 / 格式不对 → null（让服务端返 401）。
 */
export function extractBearerToken(
  authHeader: string | string[] | undefined,
): string | null {
  if (!authHeader || typeof authHeader !== "string") return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authHeader);
  return match ? match[1] : null;
}
