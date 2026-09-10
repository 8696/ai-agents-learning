/**
 * 职责：POST /api/case1-priority —— System JSON-only vs User 长文段，A/B 并排。
 * 数据流：无 body → 分叉调 sendViaA / sendViaB → judgeCase1 → CaseResponse。
 * 分叉只在本文件：判定函数里不碰 SDK。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostCase1 封装层）；
 *   Key 缺失单独写 info（校验拒绝）；子调用 sendViaA / sendViaB 内部已自带五条日志。
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
    const tHandlerStart = Date.now();
    const client = requireLlm(ctx);
    if (!client) {
      logger.info(
        "api.case1-priority",
        "POST /api/case1-priority 被无 Key 校验挡掉",
        "为什么写这条日志：服务端兜底；没 Key 就别让上游 SDK 抛一句读不懂的错。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "POST /api/case1-priority" },
      );
      return;
    }
    logger.info(
      "api.case1-priority",
      "调用函数开始：handlePostCase1",
      "为什么写这条日志：route 只认这一层返回的 CaseResponse；里面 A/B handler 是真正干活的那一层（看「调用函数开始：sendViaA / sendViaB」）。当前：Case 1（System JSON-only vs User 长文段）即将并发跑 A / B。",
      {
        入参: { caseName: CASE_PRIORITY.caseName, hasSystem: Boolean(CASE_PRIORITY.system), turnsCount: CASE_PRIORITY.turns.length },
        __code: `const [aRes, bRes] = await Promise.allSettled([sendViaA(...), sendViaB(...)]);\nctx.body = buildCaseResponse(spec, aRes, bRes, judgeCase1, "PARTIAL");`,
      },
    );
    try {
      const spec = CASE_PRIORITY;
      const [aRes, bRes] = await Promise.allSettled([
        sendViaA(client, spec.system, spec.turns),
        sendViaB(client, spec.system, spec.turns),
      ]);
      ctx.body = buildCaseResponse(spec, aRes, bRes, judgeCase1, "PARTIAL");
      logger.info(
        "api.case1-priority",
        "调用函数结束：handlePostCase1",
        "为什么写这条日志：route 要把 CaseResponse 写进 ctx.body 交给页面 stats 区；记两边结果状态便于核对「A 强 vs B 弱」的对照。当前：allSettled 已返回。",
        {
          返回值: {
            caseName: CASE_PRIORITY.caseName,
            aStatus: aRes.status,
            bStatus: bRes.status,
          },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (err: unknown) {
      logger.error(
        "api.case1-priority",
        "调用函数结束：handlePostCase1（失败）",
        "为什么写这条日志：Case 1 整条 handler 抛异常（不是 A/B 单边失败 —— 那是 Promise.allSettled 兜住的）；写 500 给前端，记 error 排错。当前：allSettled 之外的代码抛错。",
        {
          返回值: { error: err instanceof Error ? err.message : String(err) },
          耗时ms: Date.now() - tHandlerStart,
          错误: err,
        },
      );
      writeUpstreamError(ctx, err, { caseName: "case1-priority" });
    }
  });
}