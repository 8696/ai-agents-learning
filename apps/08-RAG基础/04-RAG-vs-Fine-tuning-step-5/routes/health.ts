/**
 * 职责：GET /health —— 让页脚 #env-info 拿到 provider / model / hasKey / callsModel。
 * 数据流：fetch /health → koa 路由 → getLlmOptional() → ctx.body → 页脚渲染。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { runtime } from "../lib/http/runtime-ctx.js";
import { getLlmOptional } from "../../../llm.js";
import { logger } from "../lib/logger.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    const llm = getLlmOptional();
    const body = {
      ok: true,
      port: runtime.port,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      callsModel: false,  // 混合：仅 A5 / A6 sub-page 调 LLM；6 个决策卡 sub-page 不调
    };
    logger.info(
      "│ 调用函数-/health",
      "调用函数结束：/health",
      "为什么写这条日志：页脚首次拉环境元信息（provider / model / hasKey）。",
      { 返回值: body, 耗时ms: 0 },
    );
    ctx.body = body;
  });
}