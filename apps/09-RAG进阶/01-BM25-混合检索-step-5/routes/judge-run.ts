/**
 * 职责：POST /api/judge-run —— 跑一条或全部内置判定用例。
 * body: { mode: "one"|"all", caseId?, topK? }
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { z } from "zod";
import { judgeAll, judgeCase } from "../lib/flow/handwritten-vs-wink.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  mode: z.enum(["one", "all"]),
  caseId: z.string().min(1).optional(),
  topK: z.number().int().min(1).max(20).optional().default(5),
});

export function mountJudgeRun(router: Router): void {
  router.post("/api/judge-run", async (ctx: Context) => {
    const started = Date.now();
    try {
      const parsed = BodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0]?.message ?? "入参不对", "检查 mode / caseId / topK");
      }
      const { mode, caseId, topK } = parsed.data;
      if (mode === "one") {
        if (!caseId) {
          throw new HttpError(400, "mode=one 时必须带 caseId", "从 /api/judge-cases 抄 id");
        }
        const result = await judgeCase(caseId, topK);
        ctx.body = { ok: true, result };
        return;
      }
      const result = await judgeAll(topK);
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "路由-judge-run",
        "调用函数结束：judgeRun（失败）",
        error instanceof HttpError ? error.hint : "判定失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}
