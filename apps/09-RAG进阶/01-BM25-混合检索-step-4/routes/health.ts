/**
 * 职责：GET /health。只读环境，不调模型。
 */
import Router from "@koa/router";
import { readHealth } from "../lib/http/runtime-ctx.js";

export function mountHealth(router: Router): void {
  router.get("/health", (ctx) => {
    ctx.body = readHealth();
  });
}