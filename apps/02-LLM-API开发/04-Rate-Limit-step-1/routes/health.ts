/**
 * 职责：GET /health —— 环境只读接口（ok / port / provider / model / hasKey）。
 * 数据流：无 body → JSON；总览页与各场景页启动时都会打，填页脚 #env-info。
 *
 * 日志（§5.3.16）：本端点不调 LLM、不发网络请求——单条 info 入站横幅，便于回查。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";
import { logger } from "../lib/logger.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    logger.info(
      "api.health",
      "GET /health 收到",
      "页面探活接口；hasKey 用于前端判断真 API 按钮是否可点。",
      {
        hasKey: Boolean(llm),
        provider: llm?.provider ?? null,
        model: llm?.modelA ?? null,
        port: PORT,
      },
    );
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
    };
  });
}