/**
 * 职责：GET / POST /api/conditional-graph。
 * GET 只返回声明步骤、路径映射和节点源代码；POST 才 compile + stream 跑一遍。
 *
 * 数据流：校验 drinkName → describeConditionalGraph / runConditionalGraph → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；条件分流是 step-1 加的子教学点，不并入 linear-graph.ts。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { runConditionalGraph } from "../lib/flow/conditional-graph.js";
import { describeConditionalGraph } from "../lib/flow/conditional-graph-view.js";

const bodySchema = z.object({
  drinkName: z.string().trim().min(1, "客人口述不能为空。"),
});

export function mountConditionalGraphRoutes(router: Router): void {
  router.get("/api/conditional-graph", (ctx: Context) => {
    ctx.body = { ok: true, ...describeConditionalGraph() };
  });

  router.post("/api/conditional-graph", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "客人口述不能为空。",
        issues: parsed.error.issues,
      };
      return;
    }
    try {
      const view = describeConditionalGraph();
      const result = await runConditionalGraph(parsed.data.drinkName);
      ctx.body = { ok: true, ...view, ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}
