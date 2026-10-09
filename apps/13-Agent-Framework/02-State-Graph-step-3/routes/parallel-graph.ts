/**
 * 职责：GET / POST /api/parallel-graph。
 * GET 只返回声明步骤、路径映射和节点源代码；POST 才 compile + stream 跑一遍。
 *
 * 数据流：校验 drinkName + mode → describeParallelGraph / runParallelGraph → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；并行是 step-3 的独立教学点，不并入 step-1 / step-2 路由。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { runParallelGraph, type ParallelMode } from "../lib/flow/parallel-graph.js";
import { describeParallelGraph } from "../lib/flow/parallel-graph-view.js";

const bodySchema = z.object({
  drinkName: z.string().trim().min(1, "客人口述不能为空。"),
  mode: z.enum(["no-reducer", "array-reducer", "distinct-fields"]).default("no-reducer"),
});

export function mountParallelGraphRoutes(router: Router): void {
  router.get("/api/parallel-graph", (ctx: Context) => {
    ctx.body = { ok: true, ...describeParallelGraph() };
  });

  router.post("/api/parallel-graph", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "客人口述不能为空，或 mode 不是 no-reducer / array-reducer / distinct-fields。",
        issues: parsed.error.issues,
      };
      return;
    }
    try {
      const view = describeParallelGraph();
      const result = await runParallelGraph(parsed.data.drinkName, parsed.data.mode as ParallelMode);
      ctx.body = { ok: true, ...view, ...result, mode: parsed.data.mode };
    } catch (error: unknown) {
      // 框架抛「并行冲突」异常时，catch 住并以 500 形式回给前端。
      // 这是「接口级报错」的载体——前端能直接看见错误文案和服务端堆栈。
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error && error.stack ? error.stack.split("\n").slice(0, 8).join("\n") : "";
      ctx.status = 500;
      ctx.body = {
        ok: false,
        error: message,
        errorStack: stack,
        mode: parsed.data.mode,
        parallelGroupNodes: ["branchHot", "branchIce"],
      };
    }
  });
}
