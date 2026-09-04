/**
 * 职责：GET /health —— 只读环境信息，不调模型。
 * 数据流：无 body → { ok, port, provider, model, hasKey, callsModel }；
 *   页面加载时打一次，用来填页脚 #env-info。
 *
 * step-1 是 sketch：不调 LLM，callsModel: false 告诉页面「主按钮不因缺 Key 而 disabled」（§5.3.9）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";
import { logger } from "../lib/logger.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    const payload = {
      ok: true,
      port: PORT,
      // provider / model 只能从这里来：页面写死模型名，换 LLM_PROVIDER 后页脚就在骗人。
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      callsModel: false,
    };
    logger.info(
      "健康检查",
      "GET /health 出站",
      "页面初始化打一次：填页脚 #env-info，告诉前端 provider/model/hasKey/callsModel；callsModel=false 表示主按钮不因缺 Key disabled",
      payload,
    );
    ctx.body = payload;
  });
}