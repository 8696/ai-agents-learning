/**
 * 职责：POST /api/recall-preview —— 笔记 §0 验收第 7 条「跨会话验证：新开会话时 Agent 记得我的偏好」。
 * 数据流：{ userId?, question? } → 调 lib/flow/recall-preview.recallPreview(userId, userQuestion) → 返完整 materials + modelRequest + modelResponse + answer
 *
 * 演示页要求：把「拼进 prompt 的素材 + 用户问题 + 发给大模型的 messages + 大模型返回的 response + 大模型生成的回答」全亮出来。
 * 满足笔记 §0 验收第 7 条 + 演示 SQLite 持久化（库里的 user_profile_auto / chat_session_v1 在服务重启后仍在）。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody } from "../lib/http/send-error.js";
import { recallPreview } from "../lib/flow/recall-preview.js";
import { logger } from "../lib/logger.js";

const DEFAULT_QUESTION = "下周上海分享会帮我再过一遍要点";

const BodySchema = z.object({
  userId: z.string().optional(),
  question: z.string().optional(),
});

export function mountRecallPreviewRoutes(router: Router): void {
  router.post("/api/recall-preview", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    const userId = (parsed.success && parsed.data.userId) || "default";
    const userQuestion = (parsed.success && parsed.data.question) || DEFAULT_QUESTION;

    const t0 = Date.now();
    logger.info(
      "调用函数-recall-preview-route",
      "调用函数开始：POST /api/recall-preview",
      "为什么写这条日志：变体 7-E「跨会话验证」——演示记忆被拼进 prompt + 大模型真能基于记忆回答用户问题。",
      { 入参: { userId, userQuestion }, __code: "const r = await recallPreview(userId, userQuestion);" },
    );

    const r = await recallPreview(userId, userQuestion);

    logger.info(
      "调用函数-recall-preview-route",
      "调用函数结束：POST /api/recall-preview",
      `当前：hasImage ${r.materials.hasImage}, hasConversation ${r.materials.hasConversation}；answer 长度 ${r.answer.length} 字；warnings ${r.warnings.length} 条。`,
      { 返回值: { hasImage: r.materials.hasImage, hasConversation: r.materials.hasConversation, answerLength: r.answer.length, warningsCount: r.warnings.length }, 耗时ms: Date.now() - t0 },
    );

    ctx.body = r;
  });
}
