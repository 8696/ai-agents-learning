/**
 * 职责：GET / POST /api/recursion-graph。
 * GET 只返回声明步骤和节点源代码；POST 才 invoke（按 mode 决定是否传 checkpointer / 触发 interrupt）。
 *
 * 数据流：校验 drinkName + mode + recursionLimit → invokeRecursionGraph → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；递归上限是 step-6 的独立教学点。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import {
  DEFAULT_RECURSION_LIMIT,
  invokeRecursionGraph,
  type RecursionMode,
} from "../lib/flow/recursion-graph.js";
import { describeRecursionGraph } from "../lib/flow/recursion-graph-view.js";

const bodySchema = z.object({
  drinkName: z.string().trim().min(1, "客人口述不能为空。"),
  mode: z.enum(["well-behaved", "always-broken", "graceful"]).default("well-behaved"),
  recursionLimit: z.coerce.number().int().min(2).max(50).default(DEFAULT_RECURSION_LIMIT),
});

export function mountRecursionGraphRoutes(router: Router): void {
  router.get("/api/recursion-graph", (ctx: Context) => {
    ctx.body = { ok: true, ...describeRecursionGraph() };
  });

  router.post("/api/recursion-graph", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "drinkName 不能为空；或 mode 不是 well-behaved / always-broken / graceful；或 recursionLimit 不在 2~50。",
        issues: parsed.error.issues,
      };
      return;
    }
    try {
      const result = await invokeRecursionGraph({
        drinkName: parsed.data.drinkName,
        mode: parsed.data.mode as RecursionMode,
        recursionLimit: parsed.data.recursionLimit,
      });
      ctx.body = { ok: true, ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error && error.stack ? error.stack.split("\n").slice(0, 8).join("\n") : "";
      ctx.status = 500;
      ctx.body = { ok: false, error: message, errorStack: stack };
    }
  });
}