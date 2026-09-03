/**
 * 职责：GET /health —— 环境只读接口（ok / port / provider / model / hasKey）。
 * 数据流：无 body → JSON；总览页与各场景页启动时都会打，填页脚 #env-info。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
    };
  });
}
