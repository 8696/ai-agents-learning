/**
 * 职责：POST /api/kb-node —— 跑左栏「知识库节点」的请求入口。
 *
 * 数据流：校验 query → runKBNode(...) → ctx.body。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runKBNode } from "../lib/flow/kb-node-vs-agent-node.js";

const bodySchema = z.object({
  query: z.string().min(1).max(200),
});

export function mountKBNodeRoutes(router: Router): void {
  router.post("/api/kb-node", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 query(1~200 字)。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/kb-node",
        "请求被 400 拦下",
        "为什么写这条日志：前端传错 query 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = runKBNode(parsed.data);
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "routes/kb-node",
        "runKBNode 抛错",
        "为什么写这条日志：左栏主流程是本地 mock，抛错通常是内部 bug。当前：catch 已接住。",
        { error: message },
      );
    }
  });
}