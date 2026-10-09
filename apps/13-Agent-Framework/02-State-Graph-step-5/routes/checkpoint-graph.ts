/**
 * 职责：GET / POST /api/checkpoint-graph。
 * GET 只返回声明步骤和节点源代码；POST 才 invoke（按 mode 决定是否传 checkpointer / 触发 interrupt）。
 *
 * 数据流：校验 drinkName + mode + threadId + (可选 resume) → invokeCheckpointGraph → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；检查点 + 中断是 step-5 的独立教学点。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { invokeCheckpointGraph, type CheckpointMode } from "../lib/flow/checkpoint-graph.js";
import { describeCheckpointGraph } from "../lib/flow/checkpoint-graph-view.js";

const bodySchema = z.object({
  drinkName: z.string().trim().min(1, "客人口述不能为空。"),
  mode: z.enum(["no-checkpoint", "memory-saver", "memory-saver-interrupt"]).default("no-checkpoint"),
  threadId: z.string().trim().min(1).default("A07"),
  // LangGraph 1.4.16 的 mapCommand 用 if(cmd.resume) 真值判断——传 boolean false 被吞。修法：传 object { confirm: boolean }。
  resume: z.union([z.boolean(), z.object({ confirm: z.boolean() })]).optional(),
});

export function mountCheckpointGraphRoutes(router: Router): void {
  router.get("/api/checkpoint-graph", (ctx: Context) => {
    ctx.body = { ok: true, ...describeCheckpointGraph() };
  });

  router.post("/api/checkpoint-graph", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "drinkName 不能为空；或 mode 不是 no-checkpoint / memory-saver / memory-saver-interrupt；或 threadId 为空。",
        issues: parsed.error.issues,
      };
      return;
    }
    try {
      const result = await invokeCheckpointGraph({
        drinkName: parsed.data.drinkName,
        mode: parsed.data.mode as CheckpointMode,
        threadId: parsed.data.threadId,
        resume: parsed.data.resume,
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
