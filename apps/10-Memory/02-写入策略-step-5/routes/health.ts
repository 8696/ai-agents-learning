/**
 * 职责：GET /health，只读运行时，不调模型。
 * 数据流：getLlmOptional → 端口 / 模型服务商 / 模型 / 有没有密钥。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { getLlmOptional } from "../../../llm.js";
import { PORT } from "../lib/http/runtime-ctx.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    const llm = getLlmOptional();
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      callsModel: true,
    };
  });
}
