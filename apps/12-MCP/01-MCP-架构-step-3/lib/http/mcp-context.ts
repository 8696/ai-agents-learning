/**
 * 职责：路由层复用：从 koa Context 里抽 hostId / clientInfo。
 *
 * hostId 优先来自 header X-MCP-Host-Id；缺省返回 "anonymous-host"。
 * clientInfo 来自 body.clientInfo，校验类型后通过；缺省返回 undefined（exchangeMcp 用 catalog 默认）。
 */

import type { Context } from "koa";

export function pickHostId(ctx: Context, fallback: string = "anonymous-host"): string {
  const headerVal = ctx.request.headers["x-mcp-host-id"];
  if (typeof headerVal === "string" && headerVal.length > 0) return headerVal;
  return fallback;
}

export function pickClientInfo(ctx: Context): { name: string; version: string; title: string } | undefined {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>;
  const ci = body.clientInfo;
  if (!ci || typeof ci !== "object" || Array.isArray(ci)) return undefined;
  const obj = ci as Record<string, unknown>;
  if (typeof obj.name !== "string") return undefined;
  return {
    name: obj.name,
    version: typeof obj.version === "string" ? obj.version : "0.1.0",
    title: typeof obj.title === "string" ? obj.title : obj.name,
  };
}