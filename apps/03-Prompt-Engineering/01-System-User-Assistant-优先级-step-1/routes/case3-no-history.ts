/**
 * 职责：POST /api/case3-no-history —— 多轮 WITHOUT assistant 历史（失忆对照）。
 * 数据流：无 body → sendViaA / sendViaB → judgeCase3（承认不知道 / 瞎猜）。
 * 分叉只在本文件。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { CASE_NO_HISTORY } from "../lib/flow/cases.js";
import { judgeCase3 } from "../lib/flow/judge.js";
import { buildCaseResponse } from "../lib/flow/assemble-case.js";
import { sendViaA } from "../lib/protocol-a/send-once.js";
import { sendViaB } from "../lib/protocol-b/send-once.js";
import { logger } from "../lib/logger.js";

export function mountCase3Routes(router: Router): void {
  router.post("/api/case3-no-history", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    try {
      const spec = CASE_NO_HISTORY;
      logger.info(
        "case3.received",
        "POST /api/case3-no-history",
        "Case 3（2 轮 user / user，故意漏塞中间层 assistant）请求入站；记 role 顺序确认确实「中间那层 assistant 漏了」，便于跟 Case 2 对照判「失忆」",
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
      ctx.body = buildCaseResponse(spec, aRes, bRes, judgeCase3, "FORGOT");
    } catch (err: unknown) {
      logger.error(
        "case3.fail",
        "case3-no-history 抛异常",
        "Case 3 整条 handler 抛异常（不是 A/B 单边失败 —— 那是 Promise.allSettled 兜住的）；写 500 给前端，记 error 排错",
        {
          error: err instanceof Error ? err.message : String(err),
        },
      );
      writeUpstreamError(ctx, err, { caseName: "case3-no-history" });
    }
  });
}
