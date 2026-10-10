/**
 * 职责：POST /api/step —— 跑一轮 supervisor round（店长选人 + 工人写字段）。
 *
 * 数据流：校验 body.state → runOneStep({ state }) [lib/flow/supervisor.ts] → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；route 不调 LLM、不写 while——只做入参校验 + 调核心文件。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runOneStep } from "../lib/flow/supervisor.js";

const sharedStateSchema = z.object({
  orderSlip: z.string().min(1).max(200),
  menuNotes: z.string().nullable(),
  drinkType: z.enum(["hot", "ice"]).nullable(),
  cupLabel: z.string().nullable(),
  pickupCall: z.string().nullable(),
  guestReply: z.string().nullable(),
  round: z.number().int().min(0).max(20),
});

const bodySchema = z.object({
  state: sharedStateSchema,
});

export function mountSupervisorRoutes(router: Router): void {
  router.post("/api/step", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 state（共享状态，含 orderSlip / menuNotes / drinkType / cupLabel / pickupCall / guestReply / round）。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/supervisor",
        "请求被 400 拦下",
        "为什么写这条日志：客户端发来残缺的 state 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = await runOneStep({ state: parsed.data.state });
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      const body: Record<string, unknown> = { ok: false, error: message };
      // ZodError 自带 issues 数组；流里把 safeParse 失败的 issues 拼进 message 时也带上原始 issues
      if (error instanceof Error && (error as { issues?: unknown }).issues) {
        body.issues = (error as { issues?: unknown }).issues;
      }
      ctx.body = body;
      logger.error(
        "routes/supervisor",
        "runOneStep 抛错",
        "为什么写这条日志：店长或工人某次 LLM 抛错时不能静默吞掉；通常是上游模型错误、网络问题、或 LLM 响应字段缺失（minimax 路径偶发）。当前：catch 已接住。",
        { error: message, issues: (error as { issues?: unknown }).issues ?? null },
      );
    }
  });
}
