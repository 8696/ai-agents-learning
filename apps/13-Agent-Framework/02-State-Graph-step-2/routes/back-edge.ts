/**
 * 职责：GET / POST /api/back-edge。
 * GET 只返回声明步骤、路径映射和节点源代码；POST 才 compile + stream 跑一遍。
 *
 * 数据流：校验 drinkName + mode → describeBackEdgeGraph / runBackEdgeGraph → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；回边是 step-2 的独立教学点，不并入 step-1 的 linear / conditional 路由。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { runBackEdgeGraph, type BackEdgeMode } from "../lib/flow/back-edge.js";
import { describeBackEdgeGraph } from "../lib/flow/back-edge-view.js";

const bodySchema = z.object({
  drinkName: z.string().trim().min(1, "客人口述不能为空。"),
  mode: z.enum(["smooth", "retry-once", "fail"]).default("smooth"),
});

export function mountBackEdgeRoutes(router: Router): void {
  router.get("/api/back-edge", (ctx: Context) => {
    ctx.body = { ok: true, ...describeBackEdgeGraph() };
  });

  router.post("/api/back-edge", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "客人口述不能为空，或 mode 不是 smooth / retry-once / fail。",
        issues: parsed.error.issues,
      };
      return;
    }
    try {
      const view = describeBackEdgeGraph();
      const result = await runBackEdgeGraph(parsed.data.drinkName, parsed.data.mode as BackEdgeMode);
      ctx.body = { ok: true, ...view, ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}
