/**
 * 职责：POST /api/chat，多轮对话入口。route 只校验入参、调 runFullPipeline、按返回上页。
 * 数据流：{ messages, currentQuery, toggles? } → Zod 校验 → getLlmOptional 兜底 → runFullPipeline → ctx.body。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { runFullPipeline, type ChatMessage } from "../lib/flow/full-pipeline.js";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { getLlmOptional } from "../../../llm.js";
import { logger } from "../lib/logger.js";

const ChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

const BodySchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  currentQuery: z.string(),
  /** 业务开关：跳过召回 / 关掉语义 / 关掉情景 */
  toggles: z
    .object({
      skipRecall: z.boolean().optional(),
      disableSemantic: z.boolean().optional(),
      disableEpisodic: z.boolean().optional(),
    })
    .optional(),
});

export function mountChatRoutes(router: Router): void {
  router.post("/api/chat", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 messages 数组（至少 1 条）和 currentQuery 字符串。",
      });
      return;
    }
    const messages = parsed.data.messages as ChatMessage[];
    const currentQuery = parsed.data.currentQuery.trim();
    if (!currentQuery) {
      sendError(ctx, 400, {
        error: "EMPTY_QUERY",
        explain: "currentQuery 是空的，请输入一句用户原话。",
      });
      return;
    }
    if (!getLlmOptional()) {
      sendError(ctx, 503, {
        error: "NO_KEY",
        explain: "apps/.env 里当前模型服务商还没有密钥，无法调模型。",
      });
      return;
    }

    const t0 = Date.now();
    logger.info(
      "调用函数-chat路由",
      "调用函数开始：runFullPipeline",
      "为什么写这条日志：这一层只认 runFullPipeline 的返回，里面那次调对话补全才是真发网络请求。当前：收到多轮 messages + 当前 query + 开关状态，准备走完整 4 步拼装。",
      {
        入参: {
          historyLength: messages.length,
          currentQuery,
          toggles: parsed.data.toggles,
        },
        __code: "const out = await runFullPipeline({ messages, currentQuery, toggles });",
      },
    );

    try {
      const output = await runFullPipeline({
        messages,
        currentQuery,
        toggles: parsed.data.toggles,
      });
      logger.info(
        "调用函数-chat路由",
        "调用函数结束：runFullPipeline",
        "为什么写这条日志：要把 4 步拼装完整结果（① 程序性条数 + ② 召回结果 + ③ 工作记忆历史 + ④ 模型请求/响应/回答）交给页面展示，方便学习者逐项核对。当前：即将写 ctx.body。",
        {
          返回值: {
            programRuleCount: output.programRuleCount,
            recallSkipped: output.recall.skipped,
            recallSize: output.recall.topK.length,
            historyLength: messages.length,
            answerPreview: output.modelAnswer.slice(0, 80),
          },
          耗时ms: Date.now() - t0,
        },
      );
      ctx.body = output;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        "调用函数-chat路由",
        "调用函数结束：runFullPipeline（失败）",
        "为什么写这条日志：完整 4 步拼装失败要记下原因方便回查。当前：即将把 502 返回给页面。",
        { 返回值: { error: message }, 耗时ms: Date.now() - t0 },
      );
      sendError(ctx, 502, {
        error: "CHAT_FAILED",
        explain: `4 步拼装失败：${message}`,
      });
    }
  });
}