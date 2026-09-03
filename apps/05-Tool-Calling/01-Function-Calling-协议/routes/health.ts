/**
 * 职责：GET /health · GET /tools —— 环境与 Registry 只读接口。
 * 数据流：无 body → JSON；总览页与各场景页启动时都会打。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";
import { listToolsForUi, registry } from "../lib/tools/registry.js";
// 副作用：把 4 个 Tool 注册进 Map（其它 route 间接依赖）
import "../lib/tools/tool-defs.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    ctx.body = {
      ok: true,
      port: PORT,
      model: llm?.modelA ?? null,
      provider: llm?.provider ?? null,
      hasKey: Boolean(llm),
      tools: Array.from(registry.keys()),
    };
  });

  router.get("/tools", (ctx: Context) => {
    ctx.body = listToolsForUi();
  });
}
