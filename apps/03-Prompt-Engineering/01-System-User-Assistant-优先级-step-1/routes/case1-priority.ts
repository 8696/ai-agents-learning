/**
 * 职责：POST /api/case1-priority —— System JSON-only vs User 长文段，A/B 并排。
 * 数据流：无 body → 分叉调 sendViaA / sendViaB → judgeCase1 → CaseResponse。
 * 分叉只在本文件：判定函数里不碰 SDK。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { CASE_PRIORITY } from "../lib/flow/cases.js";
import { judgeCase1 } from "../lib/flow/judge.js";
import { buildCaseResponse } from "../lib/flow/assemble-case.js";
import { sendViaA } from "../lib/protocol-a/send-once.js";
import { sendViaB } from "../lib/protocol-b/send-once.js";
import { logger } from "../lib/logger.js";

export function mountCase1Routes(router: Router): void {
  router.post("/api/case1-priority", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    try {
      const spec = CASE_PRIORITY;
      logger.info(
        "case1.received",
        "POST /api/case1-priority",
        "Case 1（System JSON-only vs User 长文段）请求入站；记 system / user 文本摘要 + turns 数，便于事后对照 A/B 谁压过谁",
        {
          caseName: spec.caseName,
          hasSystem: Boolean(spec.system),
          systemLen: spec.system?.length ?? 0,
          turnsCount: spec.turns.length,
          userLen: spec.user.length,
        },
      );
      const [aRes, bRes] = await Promise.allSettled([
        sendViaA(client, spec.system, spec.turns),
        sendViaB(client, spec.system, spec.turns),
      ]);
      ctx.body = buildCaseResponse(spec, aRes, bRes, judgeCase1, "PARTIAL");
    } catch (err: unknown) {
      logger.error(
        "case1.fail",
        "case1-priority 抛异常",
        "Case 1 整条 handler 抛异常（不是 A/B 单边失败 —— 那是 Promise.allSettled 兜住的）；写 500 给前端，记 error + upstreamStatus 排错",
        {
          error: err instanceof Error ? err.message : String(err),
        },
      );
      writeUpstreamError(ctx, err, { caseName: "case1-priority" });
    }
  });
}
