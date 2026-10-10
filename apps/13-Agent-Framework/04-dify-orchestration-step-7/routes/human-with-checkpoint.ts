/**
 * 职责：POST /api/human-with-checkpoint —— 跑右栏「人工方块 + checkpoint + idempotency」的请求入口。
 *
 * 数据流：校验 refundRequestId + amount + killAt → runHumanApprovalWithCheckpoint(...) → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；调 lib/flow/human-vs-checkpoint.ts 的主流程（runHumanApprovalWithCheckpoint）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runHumanApprovalWithCheckpoint } from "../lib/flow/human-vs-checkpoint.js";

const bodySchema = z.object({
  refundRequestId: z.string().min(1).max(64),
  amount: z.coerce.number().int().min(1).max(100000),
  killAt: z.enum(["none", "before-charge"]).default("none"),
});

export function mountHumanWithCheckpointRoutes(router: Router): void {
  router.post("/api/human-with-checkpoint", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 refundRequestId(1~64 字) + amount(1~100000 整数) + 可选 killAt('none' / 'before-charge')。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/human-with-checkpoint",
        "请求被 400 拦下",
        "为什么写这条日志：前端传错 refundRequestId / amount / killAt 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = runHumanApprovalWithCheckpoint(parsed.data);
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "routes/human-with-checkpoint",
        "runHumanApprovalWithCheckpoint 抛错",
        "为什么写这条日志：右栏主流程是本地 mock，抛错通常是内部 bug。当前：catch 已接住。",
        { error: message },
      );
    }
  });
}