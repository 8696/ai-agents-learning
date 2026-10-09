/**
 * 职责：GET / POST /api/parent-graph。
 * GET 只返回声明步骤和节点源代码；POST 才 invoke（按 mode 决定 makeDrink 装什么）。
 *
 * 数据流：校验 drinkName + mode → invokeParentGraph → ctx.body。
 * 为什么单独成一个文件：一个业务 URL 一个文件；主子图是 step-7 的独立教学点。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { invokeParentGraph, type SubgraphMode } from "../lib/flow/parent-graph.js";
import { describeParentGraph } from "../lib/flow/parent-graph-view.js";

const bodySchema = z.object({
  drinkName: z.string().trim().min(1, "客人口述不能为空。"),
  mode: z.enum(["flat", "subgraph-same-fields", "subgraph-renamed"]).default("flat"),
});

export function mountParentGraphRoutes(router: Router): void {
  router.get("/api/parent-graph", (ctx: Context) => {
    ctx.body = { ok: true, ...describeParentGraph() };
  });

  router.post("/api/parent-graph", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "drinkName 不能为空；或 mode 不是 flat / subgraph-same-fields / subgraph-renamed。",
        issues: parsed.error.issues,
      };
      return;
    }
    try {
      const result = await invokeParentGraph({
        drinkName: parsed.data.drinkName,
        mode: parsed.data.mode as SubgraphMode,
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