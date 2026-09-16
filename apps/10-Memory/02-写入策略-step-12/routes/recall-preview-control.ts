/**
 * 职责：POST /api/recall-preview-control —— 变体 7-E 的对照组。
 * 数据流：{ question? } → 调 lib/flow/recall-preview.recallPreviewNoMemory(userQuestion) → 返 modelRequest + modelResponse + answer
 *
 * 不读库、不拼素材——只发 system + user(userQuestion) 给大模型，看「没拿到记忆」的 Agent 怎么回答。
 * 和 /api/recall-preview 用同一个 userQuestion，便于页面并排对照「调记忆 vs 不调记忆」。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody } from "../lib/http/send-error.js";
import { recallPreviewNoMemory } from "../lib/flow/recall-preview.js";
import { logger } from "../lib/logger.js";

const DEFAULT_QUESTION = "下周上海分享会帮我再过一遍要点";

const BodySchema = z.object({
  question: z.string().optional(),
});

export function mountRecallPreviewControlRoutes(router: Router): void {
  router.post("/api/recall-preview-control", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    const userQuestion = (parsed.success && parsed.data.question) || DEFAULT_QUESTION;

    const t0 = Date.now();
    logger.info(
      "调用函数-recall-preview-control-route",
      "调用函数开始：POST /api/recall-preview-control",
      "为什么写这条日志：变体 7-E 对照组——同样问题但不调记忆，看大模型没素材时怎么答。",
      { 入参: { userQuestion }, __code: "const r = await recallPreviewNoMemory(userQuestion);" },
    );

    const r = await recallPreviewNoMemory(userQuestion);

    logger.info(
      "调用函数-recall-preview-control-route",
      "调用函数结束：POST /api/recall-preview-control",
      `当前：answer 长度 ${r.answer.length} 字（对照组，跟调记忆那一组用同一个 userQuestion）。`,
      { 返回值: { answerLength: r.answer.length }, 耗时ms: Date.now() - t0 },
    );

    ctx.body = r;
  });
}
