/**
 * 职责：POST /api/agent-node —— 跑右栏「智能体节点」的请求入口（带 tools + while）。
 *
 * 数据流：校验 text + maxRounds → runSmartAgentNode(...) → ctx.body。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runSmartAgentNode } from "../lib/flow/llm-node-vs-agent-node.js";

const bodySchema = z.object({
  text: z.string().min(1).max(200),
  maxRounds: z.coerce.number().int().min(1).max(8).default(4),
  /** 可选：minimax 不支持 tools，调智能体节点那一栏前先切；不传 = 用顶层 LLM_PROVIDER */
  provider: z.enum(["minimax", "zhipu", "deepseek", "qwen"]).optional(),
});

export function mountAgentNodeRoutes(router: Router): void {
  router.post("/api/agent-node", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 text(1~200 字) + 可选 maxRounds(1~8，默认 4) + 可选 provider。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/agent-node",
        "请求被 400 拦下",
        "为什么写这条日志：前端传错 text / maxRounds / provider 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = await runSmartAgentNode({
        text: parsed.data.text,
        maxRounds: parsed.data.maxRounds,
        provider: parsed.data.provider,
      });
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "routes/agent-node",
        "runSmartAgentNode 抛错",
        "为什么写这条日志：右栏主流程异常时不能静默吞掉；通常是上游模型出错或网络问题。当前：catch 已接住。",
        { error: message },
      );
    }
  });
}