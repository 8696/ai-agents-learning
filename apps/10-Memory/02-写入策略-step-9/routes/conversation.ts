/**
 * 职责：会话结束结算。
 * 数据流：POST /api/conversation/:id/close 触发该会话待结算队列一次性结算（写库）。
 *
 * 待结算会话列表由 routes/status.ts 提供（GET /api/status → pendingConversations）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { flushConversation } from "../lib/flow/trigger-write.js";
import { logger } from "../lib/logger.js";

export function mountConversationRoutes(router: Router): void {
  router.post("/api/conversation/:id/close", async (ctx: Context) => {
    const conversationId = ctx.params.id;
    logger.info(
      "调用函数-conversation-close",
      "调用函数开始：POST /api/conversation/:id/close",
      `为什么写这条日志：会话结束——一次性结算该会话的待结算队列（验证「会话中库不变，close 后才变」）。当前：拿到 conversationId = ${conversationId}。`,
      { conversationId },
    );
    const result = await flushConversation(conversationId);
    logger.info(
      "调用函数-conversation-close",
      "调用函数结束：POST /api/conversation/:id/close",
      `为什么写这条日志：让前端看见这次结算的 factsCountBefore → factsCountAfter + flushedItems + writtenKeys。当前：flushConversation 已返，flushedItems = ${result.flushedItems}，库条数 ${result.factsCountBefore} → ${result.factsCountAfter}。`,
      { 返回值: result },
    );
    ctx.body = result;
  });
}
