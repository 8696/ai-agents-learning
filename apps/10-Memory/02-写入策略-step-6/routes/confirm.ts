/**
 * 职责：POST /api/confirm，处理「待确认」区的 [记住] / [不用] 按钮调用。
 * 数据流：{ verdictId, action: "remember" | "drop" }
 → → 在 pendingStore 找对应 entry → 移除 → 写审计日志。
 *
 * 这是 step-6 「人工确认」机制的接口：用户在「待确认」区点 [记住] / [不用]，
 * 服务端把对应 verdict 从 pendingConfirmation 移到 passed（记住）或丢弃（不用）。
 *
 * 攒起来的状态本步用内存数组模拟（重启清空），生产系统应该用 SQLite 持久化。
 * 状态共享：本步用模块级单例 pendingStore（Koa 单进程下够用；多进程要换 Redis / DB）。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  verdictId: z.string(),
  action: z.enum(["remember", "drop"]),
});

/** 内存里的「待确认」池（模块级单例；重启清空） */
const pendingStore: Array<{
  id: string;
  text: string;
  key: string;
  value: string;
  type: string;
  confidence: number;
  highThreshold: number;
  midThreshold: number;
  createdAt: number;
}> = [];

export function addToPendingStore(
  entries: Array<{
    id: string;
    text: string;
    key: string;
    value: string;
    type: string;
    confidence: number;
    highThreshold: number;
    midThreshold: number;
    createdAt: number;
  }>,
): void {
  pendingStore.push(...entries);
}

export function listPendingStore(): typeof pendingStore {
  return pendingStore;
}

export function mountConfirmRoutes(router: Router): void {
  router.post("/api/confirm", (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 verdictId 字符串 + action 是 remember / drop。",
      });
      return;
    }

    const { verdictId, action } = parsed.data;
    const idx = pendingStore.findIndex((e) => e.id === verdictId);
    if (idx === -1) {
      sendError(ctx, 404, {
        error: "NOT_FOUND",
        explain: `verdictId ${verdictId} 不在「待确认」区里（可能已经处理过 / 重启服务清空了 / id 写错）。`,
      });
      return;
    }

    const entry = pendingStore[idx];
    pendingStore.splice(idx, 1);

    if (action === "remember") {
      logger.info(
        "调用函数-confirm",
        "用户确认：记住",
        `为什么写这条日志：用户在「待确认」区点了 [记住]，变体 3-D 的兜底路径——本来这条是模型自己没把握放进中档的，用户主动确认要写进库。当前：从 pendingStore 移除 entry ${entry.id}（key=${entry.key} confidence=${entry.confidence.toFixed(2)}）。下一步：等 step-(N+1) 引入 SQLite 时把这步改成真正写进库的 SQL。`,
        { 入参: { verdictId, action, entry }, __code: "// 未来：dbInsert({ key, value, type, confidence });" },
      );
      ctx.body = { ok: true, action: "remember", verdictId };
    } else {
      logger.info(
        "调用函数-confirm",
        "用户确认：不用",
        `为什么写这条日志：用户在「待确认」区点了 [不用]，变体 3-D 的兜底路径——用户主动否决了模型抽出来的这条候选。当前：从 pendingStore 移除 entry ${entry.id}（key=${entry.key} confidence=${entry.confidence.toFixed(2)}），该候选永远不进库。`,
        { 入参: { verdictId, action, entry }, __code: "// 未来：dbDelete({ verdictId });" },
      );
      ctx.body = { ok: true, action: "drop", verdictId };
    }
  });
}