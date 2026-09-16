/**
 * 职责：POST /api/capacity/config —— 设置 / 清除容量阈值。
 * 数据流：{ thresholdChars: 正整数 | null } → setCapacityConfig("default", threshold) → 落 KV key = _capacity_threshold_chars
 *
 * 读取当前阈值的 GET /api/capacity 在 routes/capacity-get.ts（§5.3.8 一路由一文件）。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { setCapacityConfig } from "../lib/flow/capacity-merge.js";
import { logger } from "../lib/logger.js";

const ConfigBodySchema = z.object({
  thresholdChars: z.number().int().min(1).nullable(),
});

export function mountCapacityConfigRoutes(router: Router): void {
  router.post("/api/capacity/config", async (ctx: Context) => {
    const parsed = ConfigBodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体格式：{ thresholdChars: 正整数 }（设阈值）或 { thresholdChars: null }（清除阈值，回到不限）",
      });
      return;
    }

    const t0 = Date.now();
    logger.info(
      "调用函数-capacity-config-route",
      "调用函数开始：POST /api/capacity/config",
      "为什么写这条日志：第 7 关变体 7-D——学习者改阈值后立刻落库，影响下次写入的自动合并判定。",
      { 入参: { thresholdChars: parsed.data.thresholdChars }, __code: "const r = await setCapacityConfig(\"default\", parsed.data.thresholdChars);" },
    );

    const r = await setCapacityConfig("default", parsed.data.thresholdChars);

    logger.info(
      "调用函数-capacity-config-route",
      "调用函数结束：POST /api/capacity/config",
      `当前：阈值 = ${parsed.data.thresholdChars ?? "不限（已清除）"}，stored = ${r.stored}。`,
      { 返回值: r, 耗时ms: Date.now() - t0 },
    );

    ctx.body = { threshold: parsed.data.thresholdChars, stored: r.stored };
  });
}