/**
 * 职责：POST /api/dedup-by-inclusion，按 key 查库 + 比 value 粒度做包含关系判定入口。
 *
 * 数据流：{ key, value, includeThreshold? } → 调 dedupByInclusion → 返回判定动作。
 *
 * 跟 routes/dedup.ts（4-A 字面 key 比对）/ routes/dedup-by-embedding.ts（4-C 跨 key 嵌入）
 * 并列：字面去重 / 语义去重 / 包含关系判定三种对照。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { dedupByInclusion } from "../lib/flow/dedup-by-inclusion.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  key: z.string().min(1, "key 不能为空"),
  value: z.unknown(),
  includeThreshold: z.coerce.number().positive().default(1.2),
  replace: z.coerce.boolean().default(false),
});

export function mountDedupByInclusionRoutes(router: Router): void {
  router.post("/api/dedup-by-inclusion", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 key 字符串 + value 字段（任意 JSON）+ includeThreshold 数值（> 1，可省略默认 1.2）。",
      });
      return;
    }

    const { key, value, includeThreshold, replace } = parsed.data;

    logger.info(
      "调用函数-路由-dedup-by-inclusion",
      "调用函数开始：POST /api/dedup-by-inclusion",
      "为什么写这条日志：变体 4-D 入口——用户填 (key, value) + includeThreshold，按 key 查库，比 value 长度判定包含关系。当前：拿到入参，准备调 dedupByInclusion。",
      { 入参: { key, value, includeThreshold }, __code: "const result = await dedupByInclusion(key, value, includeThreshold, replace);" },
    );

    const t0 = Date.now();
    const result = await dedupByInclusion(key, value, includeThreshold, replace);

    logger.info(
      "调用函数-路由-dedup-by-inclusion",
      "调用函数结束：POST /api/dedup-by-inclusion",
      `为什么写这条日志：要把包含关系判定结果返回给页面 + 记下耗时。当前：返回 action = ${result.action}。`,
      { 返回值: result, 耗时ms: Date.now() - t0 },
    );

    ctx.body = result;
  });
}
