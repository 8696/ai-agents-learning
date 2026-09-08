/**
 * 职责：Tool Gateway 三钩子。
 * 教学点：「模型请求了 ≠ 允许执行」—— 解析 tool_call 之后、执行 Tool 之前，按顺序串行检查。
 *
 * 数据流：
 *   入参 { actor, call } → checkAuth → checkQuota → checkDanger
 *     每个钩子返 Decision（allow / deny + code + msg）
 *     任一 deny → 立即停（顺序敏感：鉴权应最先）
 *
 * step-1 演示三钩子；扩展钩子（参数二次校验在 route 层 Zod；审计在执行前后写）。
 */
import { countDeletesThisMonth } from "../audit/audit-log.js";

export type Decision =
  | { allowed: true; reason: string }
  | { allowed: false; code: "FORBIDDEN" | "RATE_LIMITED" | "NEEDS_CONFIRM"; msg: string; retryAfterMs?: number };

export type Actor = { userId: string; role: "admin" | "user" };
export type DeleteUserCall = { user_id: number; reason: string; confirm_token?: string };

// ── 钩子 1：鉴权（auth）—— 只有 admin role 能调 delete_user ──
// 顺序：最先（鉴权失败后面都白做）
export function checkAuth(actor: Actor): Decision {
  if (actor.role !== "admin") {
    return { allowed: false, code: "FORBIDDEN", msg: "只有 admin role 能调 delete_user" };
  }
  return { allowed: true, reason: `鉴权通过：actor.role = ${actor.role}` };
}

// ── 钩子 2：配额（quota）—— 每月最多 5 次删除 ──
const DELETE_QUOTA_PER_MONTH = 5;
export function checkQuota(actor: Actor): Decision {
  const used = countDeletesThisMonth(actor.userId);
  if (used >= DELETE_QUOTA_PER_MONTH) {
    return {
      allowed: false,
      code: "RATE_LIMITED",
      msg: `本月 delete 配额已用 ${used}/${DELETE_QUOTA_PER_MONTH}（按 actor.userId 计数）`,
      retryAfterMs: 30 * 24 * 3600 * 1000,
    };
  }
  return { allowed: true, reason: `配额通过：已用 ${used}/${DELETE_QUOTA_PER_MONTH}` };
}

// ── 钩子 3：危险操作（danger）—— delete_user 永远要 confirm_token ──
const REQUIRED_CONFIRM_TOKEN = "I-CONFIRM";
export function checkDanger(call: DeleteUserCall): Decision {
  if (!call.confirm_token) {
    return {
      allowed: false,
      code: "NEEDS_CONFIRM",
      msg: "delete_user 是不可逆操作，必须带 confirm_token 才能执行；前端应弹二次确认 UI",
    };
  }
  if (call.confirm_token !== REQUIRED_CONFIRM_TOKEN) {
    return { allowed: false, code: "FORBIDDEN", msg: `confirm_token 不合法（应为 ${REQUIRED_CONFIRM_TOKEN}）` };
  }
  return { allowed: true, reason: `危险操作已二次确认：confirm_token = ${REQUIRED_CONFIRM_TOKEN}` };
}
