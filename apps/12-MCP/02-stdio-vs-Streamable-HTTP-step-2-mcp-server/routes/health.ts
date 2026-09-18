/**
 * 职责：GET /health。只读运行时元信息，不调大模型、不连 MCP。
 * 数据流：getHealthPayload → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { getHealthPayload } from "../lib/http/runtime-ctx.js";

export function mountHealth(router: Router): void {
  router.get("/health", (ctx: Context) => {
    ctx.body = getHealthPayload();
  });
}