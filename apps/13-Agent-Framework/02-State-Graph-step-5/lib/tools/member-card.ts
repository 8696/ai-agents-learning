/**
 * 职责：模拟 LangGraph MemorySaver 的写盘样板——同进程 Map 写一步，磁盘上**不**留检查点，杀进程即丢。
 * 真实业务里用 SqliteSaver / Redis-backed Saver；本 demo 用进程内 Map 够教学。
 *
 * 数据流：chargeMemberCard(input) → 进程内 Map 检查 idempotencyKey → 重复返回 { ok: false, error }；首次返回 { ok: true, transactionId }。
 */
function sleepRandomMs(min: number, max: number): Promise<void> {
  const delay = min + Math.floor(Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// 进程内 Map 模拟持久化层；真实业务用 Redis / DB / SQLite 表
const CHARGED_KEYS = new Set<string>();

export async function chargeMemberCard(input: { memberId: string; amount: number; idempotencyKey: string }): Promise<{ ok: boolean; transactionId?: string; error?: string }> {
  await sleepRandomMs(200, 400);
  if (CHARGED_KEYS.has(input.idempotencyKey)) {
    // 同一 key 第二次调用：拒绝重复扣
    return { ok: false, error: `idempotency_key ${input.idempotencyKey} 已扣过，不重复扣卡。` };
  }
  CHARGED_KEYS.add(input.idempotencyKey);
  return { ok: true, transactionId: `TX-${input.idempotencyKey}` };
}

/** 给前端检查幂等性状态用——拿当前已扣过的 keys（demo 用）。 */
export function listChargedKeys(): string[] {
  return Array.from(CHARGED_KEYS);
}
