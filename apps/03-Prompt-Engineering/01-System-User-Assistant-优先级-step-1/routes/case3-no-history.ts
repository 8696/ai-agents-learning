/**
 * 职责：POST /api/case3-no-history —— 多轮 WITHOUT assistant 历史（失忆对照）。
 * 数据流：无 body → sendViaA / sendViaB → judgeCase3（承认不知道 / 瞎猜）。
 * 分叉只在本文件。
 *
 * 日志（§5.3.16）：调用函数 五件套（handlePostCase3 封装层）；
 *   Key 缺失单独打 info 闸门拒绝；子调用 sendViaA / sendViaB 内部已自带五件套。
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
    const tHandlerStart = Date.now();
    const client = requireLlm(ctx);
    if (!client) {
      logger.info(
        "api.case3-no-history",
        "POST /api/case3-no-history 被无 Key 闸门挡掉",
        "为什么打：服务端兜底；没 Key 就别让上游 SDK 抛一句读不懂的错。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "POST /api/case3-no-history" },
      );
      return;
    }
    logger.info(
      "api.case3-no-history",
      "调用函数开始：handlePostCase3",
      "为什么打：route 只认这一层返回的 CaseResponse；里面 A/B handler 是「真活」。当前：Case 3（2 轮 user / user，故意漏塞中间层 assistant）即将并发跑 A / B。",
      {
        入参: {
          caseName: CASE_NO_HISTORY.caseName,
          hasSystem: Boolean(CASE_NO_HISTORY.system),
          turnsCount: CASE_NO_HISTORY.turns.length,
          roleOrder: CASE_NO_HISTORY.turns.map((t) => t.role),
        },
        __code: `const [aRes, bRes] = await Promise.allSettled([sendViaA(...), sendViaB(...)]);\nctx.body = buildCaseResponse(spec, aRes, bRes, judgeCase3, "FORGOT");`,
      },
    );
    try {
      const spec = CASE_NO_HISTORY;
      const [aRes, bRes] = await Promise.allSettled([
        sendViaA(client, spec.system, spec.turns),
        sendViaB(client, spec.system, spec.turns),
      ]);
      ctx.body = buildCaseResponse(spec, aRes, bRes, judgeCase3, "FORGOT");
      logger.info(
        "api.case3-no-history",
        "调用函数结束：handlePostCase3",
        "为什么打：route 要把 CaseResponse 写进 ctx.body；记两边结果状态便于核对「A 承认不知道 vs B 瞎猜」。当前：allSettled 已返回。",
        {
          返回值: {
            caseName: CASE_NO_HISTORY.caseName,
            aStatus: aRes.status,
            bStatus: bRes.status,
          },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (err: unknown) {
      logger.error(
        "api.case3-no-history",
        "调用函数结束：handlePostCase3（失败）",
        "为什么打：Case 3 整条 handler 抛异常（不是 A/B 单边失败 —— 那是 Promise.allSettled 兜住的）；写 500 给前端，记 error 排错。当前：allSettled 之外的代码抛错。",
        {
          返回值: { error: err instanceof Error ? err.message : String(err) },
          耗时ms: Date.now() - tHandlerStart,
          错误: err,
        },
      );
      writeUpstreamError(ctx, err, { caseName: "case3-no-history" });
    }
  });
}