/**
 * 职责：8-B 一键撤回 —— 按 audit_id 反向恢复事实库 + 标 audit.rolled_back_at。
 *
 * 数据流：rollbackAuditById(auditId)
 *   → getAudit(auditId)
 *   → 库里当前值与 audit.new_value 比对，库已被改过 → 拒绝撤回（防盲撤回吃新值）
 *   → 按 action 反向：
 *       NEW（old_value=null）→ kvDel 这一行
 *       NEW（old_value!=null）/ UPDATE / DELETE → kvSet 覆盖回 old_value
 *       MERGE / NOOP / BLOCKED → 没库动作可逆，只标 rolled_back_at
 *   → markAuditRolledBack(auditId, now)
 *   → 返 { success, auditId, restoredKey, restoredValue, reason }
 *
 * 为什么单独成文件：本步核心的一部分（8-B 撤回 = 反向恢复 + 标撤回，独立机制）。
 */
import { kvGet, kvSet, kvDel } from "../store-kv.js";
import { getAudit, markAuditRolledBack } from "../store-audit.js";
import { logger } from "../logger.js";

export interface RollbackResult {
  success: boolean;
  auditId: number;
  restoredKey: string;
  restoredValue: unknown | null;
  reason: string;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

export async function rollbackAuditById(auditId: number): Promise<RollbackResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-rollbackAudit",
    "调用函数开始：rollbackAudit",
    `为什么写这条日志：8-B 一键撤回——按 audit_id 找原行，反向恢复 kv 库 + 把 audit_log.rolled_back_at 标上。当前：拿到 auditId = ${auditId}。`,
    { 入参: { auditId } },
  );

  const audit = getAudit(auditId);
  if (!audit) {
    return { success: false, auditId, restoredKey: "", restoredValue: null, reason: "找不到这条 audit" };
  }
  if (audit.rolled_back_at) {
    return { success: false, auditId, restoredKey: audit.key, restoredValue: null, reason: "已经被撤回过，不能再撤" };
  }

  // MERGE / NOOP / BLOCKED：没有可逆的库动作
  if (audit.action === "MERGE" || audit.action === "NOOP" || audit.action === "BLOCKED") {
    markAuditRolledBack(auditId, new Date().toISOString());
    logger.warn(
      "调用函数-rollbackAudit",
      "撤回动作 no-op",
      `为什么写这条日志：MERGE / NOOP / BLOCKED 这三种 action 没有可逆的库动作；只把 audit_log 标撤回，不动库。`,
      { auditId, action: audit.action },
    );
    return { success: true, auditId, restoredKey: audit.key, restoredValue: null, reason: `${audit.action} 类型无可逆库动作，只标 audit 已撤回` };
  }

  // 库里当前值要等于 audit.new_value（否则已被后续写入覆盖，不能盲撤回）
  const currentValue = await kvGet(audit.user_id, audit.key);
  if (!deepEqual(currentValue, audit.new_value)) {
    return {
      success: false, auditId, restoredKey: audit.key, restoredValue: null,
      reason: `库已被改过（当前值 ≠ 审计时记的 new_value），盲撤回会丢新值；需先决定怎么处理新值`,
    };
  }

  // 按 action 反向：NEW / UPDATE / DELETE 都把 oldValue 写回；NEW 的 oldValue 是 null → 真删
  if (audit.action === "NEW" && audit.old_value === null) {
    // 库当前 = newValue，但新事实库里现在有；旧值 = 没有 → 真删这一行
    await kvDel(audit.user_id, audit.key);
  } else if (audit.old_value !== null) {
    await kvSet(audit.user_id, audit.key, audit.old_value);
  }

  markAuditRolledBack(auditId, new Date().toISOString());
  const result: RollbackResult = { success: true, auditId, restoredKey: audit.key, restoredValue: audit.old_value, reason: "已撤回" };
  logger.info(
    "调用函数-rollbackAudit",
    "调用函数结束：rollbackAudit",
    `为什么写这条日志：让前端看到 success=true + 库变化（库条数 / 值）。当前：action = ${audit.action}，restoredKey = ${audit.key}。`,
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );
  return result;
}
