/**
 * 职责：POST /api/compress-session —— 笔记 §6 第二层「整段 → 会话摘要」。
 * 数据流：{ text } → 调 lib/flow/compress.ts 的 compressSession → 写库（把 summary 写进 chat_session_v1 事实的 summary 字段）→ 返完整 modelRequest + modelResponse + 库状态
 *
 * 演示页要求：把 modelRequest / modelResponse 完整回传，让页面能把「跟大模型发了什么、它回了什么」全亮出来。
 * 满足需求 7 验收 ①（三栏对照：原文/摘要/字符数）②（触发压缩）③（从原文重生成）④（有损代价）。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { compressSession } from "../lib/flow/compress.js";
import { kvListForDisplay, kvSetSummary } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const SessionBodySchema = z.object({
  text: z.string().min(1, "text 不能为空（要压缩的对话原文）"),
});

export function mountCompressSessionRoutes(router: Router): void {
  router.post("/api/compress-session", async (ctx: Context) => {
    const parsed = SessionBodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体格式：{ text: \"...要压缩的对话原文...\" }",
      });
      return;
    }

    const t0 = Date.now();
    logger.info(
      "调用函数-compress-session-route",
      "调用函数开始：POST /api/compress-session",
      "为什么写这条日志：第 7 关「整段 → 会话摘要」——把一段对话原文压成 5 行内摘要；system 明确告诉模型「只从原文抽，不要参考已生成的摘要」。",
      { 入参: { textLength: parsed.data.text.length }, __code: "const sessionResult = await compressSession(parsed.data.text);" },
    );

    const sessionResult = await compressSession(parsed.data.text);
    // 把摘要写进 chat_session_v1 事实的 summary 字段（演示「原文 + 摘要并存」）
    kvSetSummary("default", "chat_session_v1", sessionResult.summary);

    const result = {
      ...sessionResult,
      currentLibrary: kvListForDisplay("default"),
    };

    logger.info(
      "调用函数-compress-session-route",
      "调用函数结束：POST /api/compress-session",
      `当前：summary 长度 ${sessionResult.summaryLength}，压缩比 ${sessionResult.compressionRatio}，summary 已写进 chat_session_v1.summary。`,
      { 返回值: { summaryLength: sessionResult.summaryLength, compressionRatio: sessionResult.compressionRatio }, 耗时ms: Date.now() - t0 },
    );

    ctx.body = result;
  });
}