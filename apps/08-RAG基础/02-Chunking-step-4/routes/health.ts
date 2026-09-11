/**
 * 职责：GET /health —— 只读环境信息，不调模型、不切块。
 * 数据流：无 body → { ok, port, provider, model, hasKey, callsModel: false }。
 *
 * 日志（§5.3.16）：本端点不调 LLM、不发网络请求——单条 info 入站横幅，不套五条日志。
 *   callsModel: false 让页面主按钮不因缺 Key 而 disabled（§5.3.9）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";
import { logger } from "../lib/logger.js";

export function mountHealth(router: Router): void {
  router.get("/health", (ctx: Context) => {
    logger.info(
      "api.health",
      "GET /health 收到",
      "页面加载写一次；记 callsModel=false 让页面主按钮不因缺 Key 而 disabled。",
      {
        callsModel: false,
        hasKey: Boolean(llm),
        provider: llm?.provider ?? null,
        model: llm?.modelA ?? null,
      },
    );
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      // 本条不调 LLM
      callsModel: false,
    };
  });
}