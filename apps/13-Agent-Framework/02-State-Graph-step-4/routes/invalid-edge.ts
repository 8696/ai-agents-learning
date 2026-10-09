/**
 * 职责：GET / POST /api/invalid-edge。
 * GET 只返回声明步骤、路径映射和节点源代码；POST 才 compile + stream 跑一遍。
 *
 * 数据流：校验 drinkName + mode → describeInvalidEdgeGraph / runInvalidEdgeGraph → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；非法转移是 step-4 的独立教学点，不并入 step-1 / step-2 / step-3 路由。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { runInvalidEdgeGraph, type InvalidEdgeMode } from "../lib/flow/invalid-edge.js";
import { describeInvalidEdgeGraph } from "../lib/flow/invalid-edge-view.js";

const bodySchema = z.object({
  drinkName: z.string().trim().min(1, "客人口述不能为空。"),
  mode: z.enum(["normal", "invalid-edge", "route-fallback"]).default("normal"),
});

export function mountInvalidEdgeRoutes(router: Router): void {
  router.get("/api/invalid-edge", (ctx: Context) => {
    ctx.body = { ok: true, ...describeInvalidEdgeGraph() };
  });

  router.post("/api/invalid-edge", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "客人口述不能为空，或 mode 不是 normal / invalid-edge / route-fallback。",
        issues: parsed.error.issues,
      };
      return;
    }
    try {
      const view = describeInvalidEdgeGraph();
      const result = await runInvalidEdgeGraph(parsed.data.drinkName, parsed.data.mode as InvalidEdgeMode);
      ctx.body = { ok: true, ...view, ...result, mode: parsed.data.mode };
    } catch (error: unknown) {
      // 框架抛「pathMap 里没有这个键」异常时，catch 住并以 500 形式回给前端。
      // 这是「接口级报错」的载体——前端能直接看见错误文案和服务端堆栈。
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error && error.stack ? error.stack.split("\n").slice(0, 8).join("\n") : "";
      ctx.status = 500;
      ctx.body = {
        ok: false,
        error: message,
        errorStack: stack,
        mode: parsed.data.mode,
      };
    }
  });
}
