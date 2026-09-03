/**
 * 职责：POST /api/simulate-zod-error —— 薄封装，业务在 flow/simulate-zod-repair。
 * 数据流：无必填 body → simulateZodRepair → 同形 rounds；模型没调工具时 body.error。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { simulateZodRepair } from "../lib/flow/simulate-zod-repair.js";

export function mountSimulateZodErrorRoutes(router: Router): void {
  router.post("/api/simulate-zod-error", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;

    console.log("\n/api/simulate-zod-error 开始");

    try {
      const out = await simulateZodRepair(client);
      if (out.error) {
        ctx.body = { error: out.error };
        return;
      }
      ctx.body = out;
    } catch (err: unknown) {
      console.error(
        `  /api/simulate-zod-error error: ${err instanceof Error ? err.message : String(err)}`,
      );
      writeUpstreamError(ctx, err, { mode: "simulate-zod-error" });
    }
  });
}
