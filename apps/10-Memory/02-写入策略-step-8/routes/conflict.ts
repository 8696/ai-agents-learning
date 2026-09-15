/**
 * 职责：POST /api/conflict/resolve，冲突解析主入口。
 * 数据流：{ key, value, intent, sourceSession?, sourceMsgSeq? }
 *   → 校验入参 → 调 resolveConflict → 把 ResolveConflictResult 返回给前端
 *
 * 业务简化：intent 由前端 / 用户主动表达传入（'new' | 'update' | 'merge' | 'delete'）；
 * 不调模型判意图（笔记 §5 决策表 + 上一轮我俩讨论的简化）。
 *
 * value 形状：业务 schema（value / type / confidence / source / validUntil）；跟 step-1 / step-6 抽出的候选事实同形。
 * intent = 'merge' 时，业务侧需要先把 values 数组合并好再传进来——这一步前端用页面模板拼好。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { resolveConflict } from "../lib/flow/resolve-conflict.js";
import { logger } from "../lib/logger.js";

const ConflictBodySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  intent: z.enum(["new", "update", "merge", "delete"]),
  sourceSession: z.string().optional(),
  sourceMsgSeq: z.number().int().nonnegative().optional(),
});

export function mountConflictRoutes(router: Router): void {
  router.post("/api/conflict/resolve", async (ctx: Context) => {
    const parsed = ConflictBodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 key 字符串 + value 字段 + intent (new | update | merge | delete)。",
      });
      return;
    }

    const { key, value, intent, sourceSession = "demo-session", sourceMsgSeq = 0 } = parsed.data;

    logger.info(
      "调用函数-conflict",
      "调用函数开始：POST /api/conflict/resolve",
      "为什么写这条日志：第 5 关「冲突与更新」主入口——按 (key, value, intent) 调 resolveConflict 决定动作 + 旧值去向。当前：拿到入参，准备调 resolveConflict。",
      { 入参: { key, value, intent, sourceSession, sourceMsgSeq }, __code: "const result = await resolveConflict({ userId: 'default', key, value, intent, sourceSession, sourceMsgSeq });" },
    );

    const t0 = Date.now();
    const result = await resolveConflict({
      userId: "default",
      key,
      value,
      intent,
      sourceSession,
      sourceMsgSeq,
    });

    logger.info(
      "调用函数-conflict",
      "调用函数结束：POST /api/conflict/resolve",
      `为什么写这条日志：要让前端看见 action / 旧值 / 新值 / 是否进历史 / 是否软删。当前：判定完成，action = ${result.action}，耗时 = ${Date.now() - t0}ms。`,
      { 返回值: result, 耗时ms: Date.now() - t0 },
    );

    ctx.body = result;
  });
}
