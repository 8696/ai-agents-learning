/**
 * 职责：GET /health。只读环境，不走等待节点、不扣款。
 * 数据流：getLlmOptional() → 页脚展示模型服务商 / 模型 / 密钥；本步 callsModel=false。
 * 为什么单独成文件：每个演示都必须有独立 health，禁止和业务 URL 混在一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { getLlmOptional } from "../../../llm.js";
import { PORT } from "../lib/http/runtime-ctx.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context, _next: Next) => {
    const llm = getLlmOptional();
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      callsModel: false,
    };
  });
}
