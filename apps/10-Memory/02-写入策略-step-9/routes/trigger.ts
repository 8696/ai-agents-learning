/**
 * 职责：写入时机触发入口 + 后台 run 状态查询。
 * 数据流：
 *   POST /api/trigger                      触发一次写入（mode: eager | background | session-end）
 *   GET  /api/trigger/status/:runId        查后台 run 状态（验证 background 「紧接 vs 过一会」时间窗口）
 *   GET  /api/trigger/runs                 列所有后台 runs（debug 用）
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import {
  triggerWrite,
  type TriggerMode,
} from "../lib/flow/trigger-write.js";
import { logger } from "../lib/logger.js";

const TriggerBodySchema = z.object({
  mode: z.enum(["eager", "background", "session-end"]),
  text: z.string().min(1, "text 不能为空"),
  conversationId: z.string().min(1, "conversationId 不能为空"),
});

export function mountTriggerRoutes(router: Router): void {
  router.post("/api/trigger", async (ctx: Context) => {
    const parsed = TriggerBodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: `请求体要有 mode (eager | background | session-end) + text 非空 + conversationId 非空。第一处问题：${issue?.path.join(".") || "(root)"} - ${issue?.message || "未知"}`,
      });
      return;
    }

    const { mode, text, conversationId } = parsed.data;
    logger.info(
      "调用函数-trigger-route",
      "调用函数开始：POST /api/trigger",
      `为什么写这条日志：写入时机触发入口——按 mode 决定这条流水线什么时候跑。当前：拿到入参，mode = ${mode}，conversationId = ${conversationId}。`,
      { 入参: { mode, text, conversationId } },
    );

    let result;
    try {
      result = await triggerWrite({ userId: "default", mode: mode as TriggerMode, text, conversationId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        "调用函数-trigger-route",
        "调用函数结束：POST /api/trigger（失败）",
        `为什么写这条日志：triggerWrite 抛错（最常见 = extractFacts 调模型失败 / 缺密钥）。当前：triggerWrite 已抛，错误 = ${message}。`,
        { 异常信息: message },
      );
      sendError(ctx, 500, { error: "INTERNAL_ERROR", explain: message });
      return;
    }

    // background 模式按 202 返回（已入队 + runId）+ 库条数 / 待结算 session-end 同理
    if (result.mode === "background") {
      ctx.status = 202;
    }
    ctx.body = result;
  });
}
