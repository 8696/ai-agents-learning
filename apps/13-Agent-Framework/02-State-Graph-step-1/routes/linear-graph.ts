/**
 * 职责：GET / POST /api/linear-graph。
 * GET 只返回声明步骤和源代码；POST 才 compile + stream 跑一遍。
 *
 * 数据流：校验 drinkName → describeLinearGraph / runLinearGraph → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；对照的手写侧以后另开 URL。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { runLinearGraph } from "../lib/flow/linear-graph.js";
import { describeLinearGraph } from "../lib/flow/linear-graph-view.js";

const bodySchema = z.object({
  drinkName: z.string().trim().min(1, "客人口述不能为空。"),
});

export function mountLinearGraphRoutes(router: Router): void {
  router.get("/api/linear-graph", (ctx: Context) => {
    ctx.body = { ok: true, ...describeLinearGraph() };
  });

  router.post("/api/linear-graph", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "客人口述不能为空。左边输入框写一句再点「跑这张线性图」。",
        issues: parsed.error.issues,
      };
      return;
    }
    try {
      const view = describeLinearGraph();
      const result = await runLinearGraph(parsed.data.drinkName);
      ctx.body = { ok: true, ...view, ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}