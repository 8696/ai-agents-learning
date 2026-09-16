/**
 * 职责：变体 7-D「库容量上限 + 自动触发合并」的写入端点。
 * 数据流：
 *   POST /api/auto-merge/write  body { key, value }
 *     → 调 lib/flow/capacity-merge.writeAndCheck
 *     → 写事实 + 检查容量 + 超阈则自动合并零碎事实到 user_profile_auto
 *     → 返 { state, merged, image?, mergedKeyCount?, scatterKeys?, modelRequest?, modelResponse? }
 *
 * 调用合并的核心走 lib/flow/capacity-merge.ts（§5.3.7 主流程单独成文件）。本文件只做入参校验 + 转发。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { writeAndCheck } from "../lib/flow/capacity-merge.js";
import { logger } from "../lib/logger.js";

const WriteBodySchema = z.object({
  key: z.string().min(1, "key 不能为空"),
  value: z.unknown(),
});

export function mountAutoMergeWriteRoutes(router: Router): void {
  router.post("/api/auto-merge/write", async (ctx: Context) => {
    const parsed = WriteBodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体格式：{ key: \"事实 key\", value: { ...事实 value... } }。value 任意 JSON 对象。",
      });
      return;
    }

    const t0 = Date.now();
    logger.info(
      "调用函数-auto-merge-write-route",
      "调用函数开始：POST /api/auto-merge/write",
      `为什么写这条日志：第 7 关变体 7-D——写入一条新事实后自动检查容量，超阈则自动合并零碎事实。当前：准备写入 key = ${parsed.data.key}。`,
      { 入参: { key: parsed.data.key, valueShape: typeof parsed.data.value }, __code: "const r = await writeAndCheck(\"default\", { key, value });" },
    );

    const r = await writeAndCheck("default", { key: parsed.data.key, value: parsed.data.value });

    logger.info(
      "调用函数-auto-merge-write-route",
      "调用函数结束：POST /api/auto-merge/write",
      `当前：merged = ${r.merged}（${r.merged ? `自动合并了 ${r.mergedKeyCount} 条零碎事实` : "没合并（库还在阈值内）"}）；库总字符 = ${r.state.currentChars}，超限 = ${r.state.exceeded}。`,
      { 返回值: { merged: r.merged, mergedKeyCount: r.mergedKeyCount, stateCurrentChars: r.state.currentChars, stateExceeded: r.state.exceeded }, 耗时ms: Date.now() - t0 },
    );

    ctx.body = r;
  });
}