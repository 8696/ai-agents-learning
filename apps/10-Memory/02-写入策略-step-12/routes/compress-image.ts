/**
 * 职责：POST /api/compress-image —— 笔记 §6 第三层「多条零碎事实 → 用户画像」。
 * 数据流：{ keys: [...] } → 调 lib/flow/compress.ts 的 mergeFactsToImage → 写库（把 image 写进 user_profile_v1 事实的 summary 字段）→ 返完整 modelRequest + modelResponse + 库状态
 *
 * 演示页要求：把 modelRequest / modelResponse 完整回传，让页面能把「跟大模型发了什么、它回了什么」全亮出来。
 * 满足需求 7 验收 ②（事实库上限触发合并；本步演示手动触发）③（从原始事实重生成，不是拿摘要再压）。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { mergeFactsToImage } from "../lib/flow/compress.js";
import { kvListForDisplay, kvSetSummary } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const ImageBodySchema = z.object({
  keys: z.array(z.string()).min(1, "keys 至少 1 个 key（要合并的事实列表）"),
});

export function mountCompressImageRoutes(router: Router): void {
  router.post("/api/compress-image", async (ctx: Context) => {
    const parsed = ImageBodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体格式：{ keys: [\"key1\", \"key2\", ...] }（要合并的事实 key 列表）",
      });
      return;
    }

    const t0 = Date.now();
    logger.info(
      "调用函数-compress-image-route",
      "调用函数开始：POST /api/compress-image",
      `为什么写这条日志：第 7 关「多条 → 画像」——把 ${parsed.data.keys.length} 条零碎事实合并成一段连贯的用户画像；system 明确告诉模型「只从事实抽，不要补充」。`,
      { 入参: { keys: parsed.data.keys }, __code: "const imageResult = await mergeFactsToImage(\"default\", parsed.data.keys);" },
    );

    const imageResult = await mergeFactsToImage("default", parsed.data.keys);
    // 把画像写进 user_profile_v1 事实的 summary 字段（演示「原文多条事实 + 合并后画像并存」）
    kvSetSummary("default", "user_profile_v1", imageResult.image);

    const result = {
      ...imageResult,
      currentLibrary: kvListForDisplay("default"),
    };

    logger.info(
      "调用函数-compress-image-route",
      "调用函数结束：POST /api/compress-image",
      `当前：image 长度 ${imageResult.imageLength}，压缩比 ${imageResult.compressionRatio}，image 已写进 user_profile_v1.summary。`,
      { 返回值: { imageLength: imageResult.imageLength, compressionRatio: imageResult.compressionRatio }, 耗时ms: Date.now() - t0 },
    );

    ctx.body = result;
  });
}