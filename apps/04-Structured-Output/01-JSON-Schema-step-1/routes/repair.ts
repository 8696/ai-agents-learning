/**
 * 职责：POST /api/repair —— 把 Zod issues 拼成可以喂回模型的 repair 文本。
 * 数据流：{ raw } → 校验 → runRepair → ctx.body。本条不真的调模型。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostRepair 封装层）；
 *   校验挡下单独写 warn；子调用 runRepair 内部已自带五条日志。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { readJsonPayload } from "../lib/http/request-guards.js";
import { runRepair } from "../lib/schema/intent.js";

export function mountRepairRoutes(router: Router): void {
  router.post("/api/repair", (ctx: Context) => {
    const tHandlerStart = Date.now();
    logger.info(
      "api.repair",
      "调用函数开始：handlePostRepair",
      "为什么写这条日志：route 只认这一层返回的 { success, issues, repairPrompt }；里面 runRepair 是真正干活的那一层（把 issues 拼成可喂回模型的修复提示）。当前：前端点了 repair 按钮；记录入参路径便于核对 prompt 是否真的写进了 issues。",
      {
        入参: { method: ctx.method, path: ctx.path },
        __code: `const payload = readJsonPayload(ctx);\nctx.body = runRepair(payload);`,
      },
    );
    const payload = readJsonPayload(ctx);
    if (payload === null) {
      logger.info(
        "api.repair",
        "调用函数结束：handlePostRepair",
        "为什么写这条日志：校验已回 400；route 不用再调 runRepair。当前：readJsonPayload 已返回 null（校验在内部写过 warn），route 直接 return。",
        {
          返回值: { httpStatus: 400, success: null },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      return;
    }
    const result = runRepair(payload);
    ctx.body = result;
    logger.info(
      "api.repair",
      "调用函数结束：handlePostRepair",
      "为什么写这条日志：route 要把 runRepair 的结果写进 ctx.body 交给页面；记 success / issuesCount / hasRepairPrompt 便于核对「payload 合法时是否带 note」。当前：runRepair 已返回。",
      {
        返回值: { success: result.success, issuesCount: (result as { issues?: unknown[] }).issues?.length ?? 0, hasRepairPrompt: (result as { repairPrompt?: string }).repairPrompt?.slice(0, 50) ?? null },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  });
}