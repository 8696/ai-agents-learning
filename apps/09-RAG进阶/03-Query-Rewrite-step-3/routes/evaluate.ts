/**
 * 职责：POST /api/evaluate，跑评测 + 返回命中率对照 + 每题命中详情。
 * 数据流：body = { modes: ["original","rewritten"] } → runEvaluate → JSON。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runEvaluate, type EvalMode } from "../lib/flow/evaluate.js";
import { sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  modes: z.array(z.enum(["original", "rewritten"])).optional(),
});

export function mountEvaluateRoutes(router: Router): void {
  router.post("/api/evaluate", async (ctx: Context, _next: Next) => {
    const parsed = bodySchema.safeParse(ctx.request.body || {});
    if (!parsed.success) {
      sendError(ctx, 400, "请求体非法（modes 可选：original / rewritten）");
      return;
    }
    const modes: EvalMode[] = parsed.data.modes && parsed.data.modes.length > 0
      ? parsed.data.modes
      : ["original", "rewritten"];
    try {
      const result = await runEvaluate({ modes });
      ctx.body = { ok: true, stage: "evaluate", ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 502, "跑评测失败：" + message);
    }
  });
}