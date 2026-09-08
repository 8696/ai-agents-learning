/**
 * 职责：POST /api/billing-compare —— 连跑两次固定 preset，产出并排的两张账单 + 结论。
 * 数据流：无 body → 闸门（只查 Key）→ compareInputVsOutput → { cases, verdict }。
 * 本页教学点在 public/pages/compare.html：同样的 Token 总量，落在输出侧更贵。
 *
 * 日志（§5.3.16）：调用函数 五件套（handlePostBillingCompare 封装层）；
 *   Key 缺失单独打 info 闸门拒绝；失败用 error + （失败）；
 *   真正循环日志全部在 lib/flow/compare-input-output.ts。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm } from "../lib/http/request-guards.js";
import { writeMeasurementError } from "../lib/http/write-upstream-error.js";
import { compareInputVsOutput } from "../lib/flow/compare-input-output.js";
import { logger } from "../lib/logger.js";

export function mountBillingCompareRoutes(router: Router): void {
  router.post("/api/billing-compare", async (ctx: Context) => {
    // 这个端点没有入参：preset 写死在 lib/flow/compare-input-output.ts，
    // 对照实验必须两边条件可控，让页面随便传 prompt 就不叫对照了。
    const client = requireLlm(ctx);
    if (!client) {
      logger.info(
        "api.billing-compare",
        "POST /api/billing-compare 被无 Key 闸门挡掉",
        "为什么打：闸门挡掉没花模型额度也没走到「调用模型」，但客户端要知道「为什么 503」。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "POST /api/billing-compare" },
      );
      return;
    }

    const tHandlerStart = Date.now();
    logger.info(
      "api.billing-compare",
      "调用函数开始：handlePostBillingCompare",
      "为什么打：route 只认这一层返回的 CompareResult；里面那个 for 循环是出网调用的循环（看「调用循环开始：compareInputVsOutput」）。当前：即将交给 compareInputVsOutput。",
      {
        入参: {
          llmProvider: client.provider,
          llmModelA: client.modelA,
        },
        __code: `const result = await compareInputVsOutput(client);`,
      },
    );

    try {
      const result = await compareInputVsOutput(client);
      ctx.body = { mode: "compare", ...result };

      logger.info(
        "api.billing-compare",
        "调用函数结束：handlePostBillingCompare",
        "为什么打：route 要把 CompareResult（cases + verdict）写进 ctx.body 交给页面。当前：两次调用都跑完，verdict 已算。",
        {
          返回值: {
            casesCount: result.cases.length,
            verdict: result.verdict,
          },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (err: unknown) {
      // 第二次调用失败时前面那次的钱已经花掉了，所以错误里要说明「可能只跑成了一次」
      logger.error(
        "api.billing-compare",
        "调用函数结束：handlePostBillingCompare（失败）",
        "为什么打：第二次失败时前面那次的钱已经花掉了，错误里要说明「可能只跑成了一次」。当前：compareInputVsOutput 在第 N 轮抛错（cases 可能不完整），交给 writeMeasurementError 写统一错误响应。",
        {
          返回值: {
            mode: "compare",
            error: err instanceof Error ? err.message : String(err),
          },
          耗时ms: Date.now() - tHandlerStart,
          错误: err,
        },
      );
      console.error("[/api/billing-compare] 失败：", err);
      writeMeasurementError(ctx, err, { mode: "compare" });
    }
  });
}