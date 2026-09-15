/**
 * 职责：POST /api/time/skip，把「现在」快进 N 天后跑一次 scanForExpired 把过期事实归档。
 * 数据流：{ days } → setTimeOffset(days * 86400_000) → scanForExpired(userId, asOf) → JSON
 *
 * 满足需求 6 验收 ①「时间快进后过期条目从召回候选里消失」——这一步是「时间快进开关」入口。
 * 服务端仅在本 demo 用 setTimeOffset 模拟；生产应该走真实时间（cron / scheduled job）。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { scanForExpired, setTimeOffset, getAsOf } from "../lib/flow/expiration.js";
import { logger } from "../lib/logger.js";

const TimeSkipBodySchema = z.object({
  days: z.number().int().min(0).max(3650), // 上限 10 年，避免误操作
});

const OFFSET_BASE_MS = (days: number): number => days * 86400_000;

export function mountTimeSkipRoutes(router: Router): void {
  router.post("/api/time/skip", async (ctx: Context) => {
    const parsed = TimeSkipBodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 days 整数（0~3650，代表把「现在」快进 N 天）。",
      });
      return;
    }

    const { days } = parsed.data;
    const offsetMs = OFFSET_BASE_MS(days);

    logger.info(
      "调用函数-time-skip",
      "调用函数开始：POST /api/time/skip",
      `为什么写这条日志：6-B「事实自带有效期」+ 6 关键区分「过期 ≠ 删除」——把「现在」快进 N 天，跑 scanForExpired 把 validUntil < asOf 的事实写 archived_at（满足需求 6 验收 ①）。当前：拿到 days = ${days}。`,
      { 入参: { days, offsetMs }, __code: "setTimeOffset(offsetMs); const asOf = getAsOf(); const result = scanForExpired('default', asOf);" },
    );

    setTimeOffset(offsetMs);
    const asOf = getAsOf();
    const t0 = Date.now();
    const result = scanForExpired("default", asOf);

    logger.info(
      "调用函数-time-skip",
      "调用函数结束：POST /api/time/skip",
      `为什么写这条日志：让前端看见本次快进了多少天 + 扫了多少条 + 新归档多少条 + 哪些 key。当前：扫描完成，archived = ${result.archived}。`,
      { 返回值: { asOf, ...result, skippedDays: days }, 耗时ms: Date.now() - t0, 字段释义: {
        "asOf": "快进后的「现在」（ISO 8601）",
        "scanned": "扫过的总条数",
        "archived": "本次新归档的条数（validUntil < asOf 且未归档过）",
        "archivedKeys": "本次新归档的 keys",
        "skippedDays": "本次快进的天数",
      } },
    );

    ctx.body = { asOf, skippedDays: days, ...result };
  });
}