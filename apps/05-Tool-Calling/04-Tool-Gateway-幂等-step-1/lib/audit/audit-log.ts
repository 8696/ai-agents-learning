/**
 * 职责：审计日志。每条 Tool 调用一行（actor / tool / args_hash / decision / reason_code / result_hash / ts）。
 * step-1 简化：进程内 Map；重启清空；生产用 DB / append-only 文件。
 *
 * 数据流：
 *   appendAudit(entry) → 内存数组
 *   listAudit() → 复制整段
 *   countDeletesThisMonth(userId) → 过滤本月 + tool=delete_user + decision=allowed
 */
export type AuditEntry = {
  ts: string;
  actor: { userId: string; role: string };
  tool: string;
  args_hash: string;
  decision: "allowed" | "blocked";
  reason_code?: string; // FORBIDDEN / RATE_LIMITED / NEEDS_CONFIRM / OK / INVALID_PARAM
  result_hash?: string;
  payload?: Record<string, unknown>;
};

const auditLog: AuditEntry[] = [];

/** 简易 hash：用于 args / result 指纹；不加密，只用于审计对照 */
export function hash(input: unknown): string {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 8);
}

export function appendAudit(entry: AuditEntry): void {
  auditLog.push(entry);
}

export function listAudit(): AuditEntry[] {
  return [...auditLog];
}

/** 本月当前 actor 成功执行 delete_user 的次数（用于配额钩子） */
export function countDeletesThisMonth(userId: string): number {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  return auditLog.filter(
    (e) =>
      e.tool === "delete_user" &&
      e.actor.userId === userId &&
      e.ts.startsWith(month) &&
      e.decision === "allowed",
  ).length;
}
