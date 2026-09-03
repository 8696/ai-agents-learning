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

export function mountCase2Routes(router: Router): void {
  router.post("/api/case2-with-history", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    try {
      const spec = CASE_WITH_HISTORY;
      const [aRes, bRes] = await Promise.allSettled([
        sendViaA(client, spec.system, spec.turns),
        sendViaB(client, spec.system, spec.turns),
      ]);
      ctx.body = buildCaseResponse(spec, aRes, bRes, judgeCase2, "FORGOT");
    } catch (err: unknown) {
      writeUpstreamError(ctx, err, { caseName: "case2-with-history" });
    }
  });
}
