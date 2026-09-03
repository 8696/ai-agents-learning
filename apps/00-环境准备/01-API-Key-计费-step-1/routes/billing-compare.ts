/**
 * 职责：POST /api/billing-compare —— 连跑两次固定 preset，产出并排的两张账单 + 结论。
 * 数据流：无 body → 闸门（只查 Key）→ compareInputVsOutput → { cases, verdict }。
 * 本页教学点在 public/pages/compare.html：同样的 Token 总量，落在输出侧更贵。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm } from "../lib/http/request-guards.js";
import { writeMeasurementError } from "../lib/http/write-upstream-error.js";
import { compareInputVsOutput } from "../lib/flow/compare-input-output.js";

export function mountBillingCompareRoutes(router: Router): void {
  router.post("/api/billing-compare", async (ctx: Context) => {
    // 这个端点没有入参：preset 写死在 lib/flow/compare-input-output.ts，
    // 对照实验必须两边条件可控，让页面随便传 prompt 就不叫对照了。
    const client = requireLlm(ctx);
    if (!client) return;

    try {
      const result = await compareInputVsOutput(client);
      ctx.body = { mode: "compare", ...result };
    } catch (err: unknown) {
      // 第二次调用失败时前面那次的钱已经花掉了，所以错误里要说明「可能只跑成了一次」
      console.error("[/api/billing-compare] 失败：", err);
      writeMeasurementError(ctx, err, { mode: "compare" });
    }
  });
}
