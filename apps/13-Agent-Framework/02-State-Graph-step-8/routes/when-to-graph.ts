/**
 * 职责：GET / POST /api/when-to-graph。
 * GET 只返回声明步骤和节点源代码；POST 才 invoke（按 mode 决定 flat 还是 over-graphed）。
 *
 * 数据流：校验 question + mode → invokeWhenToGraph → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；变体 J 是 step-8 的独立教学点。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { invokeWhenToGraph, type WhenToGraphMode } from "../lib/flow/when-to-graph.js";
import { describeWhenToGraph } from "../lib/flow/when-to-graph-view.js";

const bodySchema = z.object({
  question: z.string().trim().min(1, "问题不能为空。"),
  mode: z.enum(["flat-single-node", "over-graphed"]).default("flat-single-node"),
});

export function mountWhenToGraphRoutes(router: Router): void {
  router.get("/api/when-to-graph", (ctx: Context) => {
    ctx.body = { ok: true, ...describeWhenToGraph() };
  });

  router.post("/api/when-to-graph", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "question 不能为空；或 mode 不是 flat-single-node / over-graphed。",
        issues: parsed.error.issues,
      };
      return;
    }
    try {
      const result = await invokeWhenToGraph({
        question: parsed.data.question,
        mode: parsed.data.mode as WhenToGraphMode,
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