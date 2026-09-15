/**
 * 职责：POST /api/chat —— 模拟「公司内部前端代码助手」正常对话回复（真调大模型）。
 * 数据流：{ userText, conversationId } → 拼 system 提示词 + userText → 协议 A 对话补全 → 返回 { reply, modelRequest, modelResponse }。
 *
 * 本步目的：让三个 sub-page（eager / background / session-end）的「正常会话」共用同一份回复逻辑；
 * 真正可观察的差别是「这条回复传出去之后，按哪种 mode 触发写入」——这一步只负责回复，不调 triggerWrite。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";

const ChatBodySchema = z.object({
  userText: z.string().min(1, "userText 不能为空"),
  conversationId: z.string().optional(),
});

export function mountChatRoutes(router: Router): void {
  router.post("/api/chat", async (ctx: Context) => {
    const parsed = ChatBodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 userText 非空字符串；conversationId 可选。",
      });
      return;
    }

    const { userText, conversationId = "demo-session" } = parsed.data;
    const t0 = Date.now();
    logger.info(
      "调用函数-chat",
      "调用函数开始：POST /api/chat",
      `为什么写这条日志：让三个 sub-page 都能跑「正常对话」；前端 user message → 这里拿助手回复 → 再按 mode 触发写入。当前：拿到 userText，长度 = ${userText.length}。`,
      { 入参: { userText, conversationId } },
    );

    try {
      const llm = await getLlm();
      const request = {
        model: llm.modelA,
        messages: [
          {
            role: "system" as const,
            content: "你是公司内部一个前端代码助手 Agent。简短回复（2~4 句），不要长篇大论；用户原话里如果有偏好/事实，尽量在回复里自然承认（这样后面三个 sub-page 的写入流水线才能从这一轮对话里抽到事实）。",
          },
          { role: "user" as const, content: userText },
        ],
        temperature: 0.5,
      };
      logger.info(
        "││ 调用模型-chat-对话补全",
        "调用模型开始：chat 对话补全",
        "为什么写这条日志：这是真发网络请求的那一次，不用它就没有 assistant reply。当前：request 已拼好；model = " + llm.modelA + "。",
        { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
      );
      const response = await llm.openai.chat.completions.create(request);
      const reply = response.choices?.[0]?.message?.content ?? "";

      logger.info(
        "││ 调用模型-chat-对话补全",
        "调用模型结束：chat 对话补全",
        `为什么写这条日志：要让前端拿到 assistant reply，让三个 sub-page 的「正常对话」能继续。当前：response 已返；reply 长度 = ${reply.length}。`,
        { 返回值: response, 耗时ms: Date.now() - t0, 字段释义: { "choices[0].message.content": "assistant 这一轮的回复原文" } },
      );

      ctx.body = { reply, modelRequest: request, modelResponse: response };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        "调用函数-chat",
        "调用函数结束：POST /api/chat（失败）",
        `为什么写这条日志：调模型失败（最常见 = 缺 Key / 网络断）。当前：chat 调用抛错，错误 = ${message}。`,
        { 异常信息: message },
      );
      sendError(ctx, 500, { error: "INTERNAL_ERROR", explain: message });
    }
  });
}
