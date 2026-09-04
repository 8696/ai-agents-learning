/**
 * 职责：POST /api/case2-with-history —— 多轮 WITH assistant 历史，A/B 并排。
 * 数据流：无 body → sendViaA / sendViaB → judgeCase2（提到北京 = REMEMBERED）。
 * 分叉只在本文件。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { CASE_WITH_HISTORY } from "../lib/flow/cases.js";
import { judgeCase2 } from "../lib/flow/judge.js";
import { buildCaseResponse } from "../lib/flow/assemble-case.js";
import { sendViaA } from "../lib/protocol-a/send-once.js";
import { sendViaB } from "../lib/protocol-b/send-once.js";
import { logger } from "../lib/logger.js";

export function mountCase2Routes(router: Router): void {
  router.post("/api/case2-with-history", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    try {
      const spec = CASE_WITH_HISTORY;
      logger.info(
        "case2.received",
        "POST /api/case2-with-history",
        "Case 2（3 轮 user / assistant / user 含历史）请求入站；记 turns 数 + role 顺序便于事后核对「A 把 system 放哪 / B 把 system 放哪 / assistant 历史有没有漏塞」",
        {
          caseName: spec.caseName,
          hasSystem: Boolean(spec.system),
          turnsCount: spec.turns.length,
          roleOrder: spec.turns.map((t) => t.role),
        },
      );
      const [aRes, bRes] = await Promise.allSettled([
        sendViaA(client, spec.system, spec.turns),
        sendViaB(client, spec.system, spec.turns),
      ]);
      ctx.body = buildCaseResponse(spec, aRes, bRes, judgeCase2, "FORGOT");
    } catch (err: unknown) {
      logger.error(
        "case2.fail",
        "case2-with-history 抛异常",
        "Case 2 整条 handler 抛异常（不是 A/B 单边失败 —— 那是 Promise.allSettled 兜住的）；写 500 给前端，记 error 排错",
        {
          error: err instanceof Error ? err.message : String(err),
        },
      );
      writeUpstreamError(ctx, err, { caseName: "case2-with-history" });
    }
  });
}
