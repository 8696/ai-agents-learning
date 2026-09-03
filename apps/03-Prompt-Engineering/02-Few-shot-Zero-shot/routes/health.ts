/**
 * 职责：GET /health —— 只读环境信息 + 教案元数据，不调模型。
 * 数据流：无 body → { ok, port, provider, model, hasKey, product, fewShotTurns, samples }；
 *   两个页面加载时都打一次，用来填页脚 #env-info 并决定主按钮是否 disabled。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";
import { FEW_SHOT_TURNS, SAMPLE_REVIEWS } from "../lib/classify/presets.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      product: "豆谷评价分类",
      fewShotTurns: FEW_SHOT_TURNS.length / 2,
      samples: SAMPLE_REVIEWS,
    };
  });
}
