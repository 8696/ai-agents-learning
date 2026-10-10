/**
 * 职责：POST /api/agent-node-with-kb —— 跑右栏「Agent 循环节点」的请求入口（带 KB 检索 + LLM 汇总）。
 *
 * 数据流：校验 query → runAgentNodeWithKB(...) → ctx.body。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runAgentNodeWithKB } from "../lib/flow/kb-node-vs-agent-node.js";

const bodySchema = z.object({
  query: z.string().min(1).max(200),
});

export function mountAgentNodeWithKBRoutes(router: Router): void {
  router.post("/api/agent-node-with-kb", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 query(1~200 字)。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/agent-node-with-kb",
        "请求被 400 拦下",
        "为什么写这条日志：前端传错 query 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = runAgentNodeWithKB(parsed.data);
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "routes/agent-node-with-kb",
        "runAgentNodeWithKB 抛错",
        "为什么写这条日志：右栏主流程是本地 mock，抛错通常是内部 bug。当前：catch 已接住。",
        { error: message },
      );
    }
  });
}