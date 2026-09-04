/**
 * 职责：GET /health —— 只读环境信息 + 对照样本，不调模型、不 encode。
 * 数据流：无 body → { ok, port, provider, model, hasKey, callsModel: false, samples }。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";
import { CHINESE, ENGLISH, VOCAB_LABEL } from "../lib/tokenize/presets.js";
import { logger } from "../lib/logger.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    logger.info("health.received", "GET /health", "页面加载打一次；记 callsModel + hasKey 让排错时能区分「真没配 Key」与「故意不调模型」", {
      callsModel: false,
      hasKey: Boolean(llm),
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
    });
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      // 本条不调 LLM：页面主按钮不因缺 Key 而 disabled（§5.3.9）。
      callsModel: false,
      vocab: VOCAB_LABEL,
      samples: { english: ENGLISH, chinese: CHINESE },
    };
  });
}
