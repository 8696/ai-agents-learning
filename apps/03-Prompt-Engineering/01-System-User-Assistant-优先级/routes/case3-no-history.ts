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

export function mountCase3Routes(router: Router): void {
  router.post("/api/case3-no-history", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    try {
      const spec = CASE_NO_HISTORY;
      const [aRes, bRes] = await Promise.allSettled([
        sendViaA(client, spec.system, spec.turns),
        sendViaB(client, spec.system, spec.turns),
      ]);
      ctx.body = buildCaseResponse(spec, aRes, bRes, judgeCase3, "FORGOT");
    } catch (err: unknown) {
      writeUpstreamError(ctx, err, { caseName: "case3-no-history" });
    }
  });
}
