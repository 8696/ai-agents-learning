/**
 * 职责：Tool 定义 · delete_user —— 永久删除用户账号（不可逆）。
 * 数据流：tool_use.input → Zod schema safeParse → handler(args, ctx) → Gateway 三钩子（鉴权/配额/危险）→ audit。
 *
 * 教学锚点（覆盖本条 04 Tool Gateway · 变体 1）：
 *   - **不是**"模型发出 tool_call 就执行"——Tool handler 内部**先走 Gateway 三钩子**，任一不过返 NEEDS_CONFIRM / FORBIDDEN / RATE_LIMITED。
 *   - 鉴权（admin role 才能调）→ 配额（每月 5 次）→ 危险（必须 confirm_token）→ 全过才执行（伪执行，不真删 DB）。
 *   - dangerous: true 仅作 Registry 闸标记；**真正拦截在 handler 内的 Gateway 三钩子**（教学点：Registry ≠ Gateway）。
 *   - 失败也写 audit：让排查「为什么这次没执行」有依据（actor / args_hash / decision / reason_code 全留痕）。
 *
 * 日志（§5.3.16）：每条审计行 + Gateway 三钩子各打一次（五件套含 __code）。
 */
import { z } from "zod";
import { checkAuth, checkQuota, checkDanger, type DeleteUserCall } from "../gateway/hooks.js";
import { appendAudit, hash } from "../audit/audit-log.js";
import type { ToolContext, HookTraceRow } from "./registry.js";

type HandlerResult =
  | { kind: "ok"; payload: Record<string, unknown>; hookTrace: HookTraceRow[] }
  | { kind: "error"; code: string; message: string; hookTrace: HookTraceRow[]; retryAfterMs?: number };

export const deleteUserTool = {
  name: "delete_user",
  description:
    "永久删除一个用户账号（不可逆）。**直接按入参数发请求即可**；能否执行由后端 Tool Gateway 在执行前判定（鉴权：actor role / 配额：每月上限 / 危险：confirm_token 二次确认）。任一步不过会返结构化错误（如 NEEDS_CONFIRM / FORBIDDEN / RATE_LIMITED），由前端按 code 走下一步。不要自己预判 caller 身份或配额是否充足。",
  schema: z.object({
    user_id: z.coerce.number().int().positive(),
    reason: z.string().trim().min(1, "reason 必填"),
  }),
  // Registry 闸的防御标记；本 demo 真正拦截在 handler 内的 Gateway 三钩子
  dangerous: true,
  handler: (args: { user_id: number; reason: string }, ctx: ToolContext): HandlerResult => {
    const call: DeleteUserCall = {
      user_id: args.user_id,
      reason: args.reason,
      confirm_token: ctx.confirmToken,
    };
    const callHash = hash(call);

    // ── 钩子 1：鉴权（admin role 才能调）──
    const auth = checkAuth(ctx.actor);
    const trace: HookTraceRow[] = [
      { hook: "auth", allowed: auth.allowed, reason: auth.allowed ? auth.reason : auth.msg, code: auth.allowed ? undefined : auth.code },
    ];
    if (!auth.allowed) {
      appendAudit({
        ts: new Date().toISOString(),
        actor: ctx.actor,
        tool: "delete_user",
        args_hash: callHash,
        decision: "blocked",
        reason_code: auth.code,
      });
      return { kind: "error", code: auth.code, message: auth.msg, hookTrace: trace };
    }

    // ── 钩子 2：配额（每月 5 次 delete）──
    const quota = checkQuota(ctx.actor);
    trace.push({
      hook: "quota",
      allowed: quota.allowed,
      reason: quota.allowed ? quota.reason : quota.msg,
      code: quota.allowed ? undefined : quota.code,
    });
    if (!quota.allowed) {
      appendAudit({
        ts: new Date().toISOString(),
        actor: ctx.actor,
        tool: "delete_user",
        args_hash: callHash,
        decision: "blocked",
        reason_code: quota.code,
      });
      // #14：把 retryAfterMs 端到端透传给模型下轮（让模型告诉用户「今天调满了，明天再试」）
      return { kind: "error", code: quota.code, message: quota.msg, hookTrace: trace, retryAfterMs: quota.retryAfterMs };
    }

    // ── 钩子 3：危险操作（不可逆 → 必须 confirm_token）──
    const danger = checkDanger(call);
    trace.push({
      hook: "danger",
      allowed: danger.allowed,
      reason: danger.allowed ? danger.reason : danger.msg,
      code: danger.allowed ? undefined : danger.code,
    });
    if (!danger.allowed) {
      appendAudit({
        ts: new Date().toISOString(),
        actor: ctx.actor,
        tool: "delete_user",
        args_hash: callHash,
        decision: "blocked",
        reason_code: danger.code,
      });
      return { kind: "error", code: danger.code, message: danger.msg, hookTrace: trace };
    }

    // ── 三钩子全过：执行（伪执行 · 不真删 DB） + 写审计 ──
    const resultHash = hash(`deleted user ${call.user_id} at ${new Date().toISOString()}`);
    appendAudit({
      ts: new Date().toISOString(),
      actor: ctx.actor,
      tool: "delete_user",
      args_hash: callHash,
      decision: "allowed",
      reason_code: "OK",
      result_hash: resultHash,
      payload: { user_id: call.user_id, reason: call.reason },
    });

    return {
      kind: "ok",
      payload: {
        executed: "delete_user",
        result: { user_id: call.user_id, deleted: true, reason: call.reason },
      },
      hookTrace: trace,
    };
  },
};