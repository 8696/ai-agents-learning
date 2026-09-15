/**
 * 职责：写入时机后台 run 状态查询。
 * 数据流：GET /api/trigger/status/:runId → 查 lib/flow/trigger-state.ts 里的 backgroundRuns Map。
 *
 * 拆文件原因（§5.3.8 一个业务 URL 一个文件）：
 *   routes/trigger.ts 只挂 POST /api/trigger（发起）；本文件只挂 GET /api/trigger/status/:runId（查询），
 *   各自一个 URL。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { getBackgroundRun } from "../lib/flow/trigger-state.js";
import { sendError } from "../lib/http/send-error.js";


export function mountTriggerStatusRoutes(router: Router): void {
  router.get("/api/trigger/status/:runId", (ctx: Context) => {
    const runId = ctx.params.runId;
    const run = getBackgroundRun(runId);
    if (!run) {
      sendError(ctx, 404, { error: "RUN_NOT_FOUND", explain: `找不到 runId = ${runId} 的后台 run。` });
      return;
    }
    ctx.body = run;
  });
}
