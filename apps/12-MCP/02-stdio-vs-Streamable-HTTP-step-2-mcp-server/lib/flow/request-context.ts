/**
 * 职责：用 AsyncLocalStorage 把 HTTP 层的 userId 传到 Tool / Resource / Prompt handler。
 *
 * 数据流：
 *   routes/mcp-endpoint.ts
 *     → checkBearer 拿到 userId
 *     → runWithUser(userId, () => transport.handleRequest(...))
 *   lib/flow/mcp-http-server.ts 的 Tool handler
 *     → getCurrentUserId() 拿到当前请求的 userId
 *     → 调 tickets-store.listTicketsForUser(userId) 过滤
 *
 * 为什么单独成文件：userId 跨层的传递机制独立成模块；
 * 模块级 currentUserId 变量并发不安全（两个请求同时打就乱），ALS 是 Node 22 内置零依赖。
 */
import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  userId: string;
}

const als = new AsyncLocalStorage<RequestContext>();

/**
 * 在 userId 上下文里跑 fn。fn 内部所有 async 调用都看得到这个 userId。
 */
export function runWithUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return als.run({ userId }, fn);
}

/**
 * 给 Tool / Resource / Prompt handler 读当前请求的 userId。
 * 兜底返 undefined（理论上 handler 总在 runWithUser 上下文里跑，但兜底更稳）。
 */
export function getCurrentUserId(): string | undefined {
  return als.getStore()?.userId;
}
