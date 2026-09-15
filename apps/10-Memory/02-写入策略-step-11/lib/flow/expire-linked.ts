/**
 * 职责：本步核心——变体 6-D「被新事实挤掉」= 模型判定要归档哪些旧事实 → 直接 UPDATE。
 * 数据流：keysToArchive = ['school', ...] → 直接 UPDATE kv SET archived_at = ? WHERE user_id = ? AND key = ? AND archived_at IS NULL
 *
 * 为什么直接按 key UPDATE 而不是按 value.expires_with 匹配：第二次模型调用（routes/expire-linked.ts 内）会告诉「这条新事实让哪些旧事实过期」，直接返回 key 列表；再让每条旧事实自己标 expires_with 是冗余的（事实表 schema 不需要新增字段）。
 * 模型判断可能错（不该归档的归档了）——demo 场景里 school / university / job 关联明显，不会错；生产应该有用户确认。
 *
 * 设计：调用方（routes/expire-linked.ts）拿到第二次模型返回的 key 列表，调本函数直接归档。
 */
import { kvDb } from "../db.js";
import { logger } from "../logger.js";

const stmtSetArchived = kvDb.prepare("UPDATE kv SET archived_at = ? WHERE user_id = ? AND key = ? AND archived_at IS NULL");

export interface ExpireLinkedResult {
  scanned: number;
  archived: number;
  archivedKeys: string[];
}

/**
 * 把 keysToArchive 列表里这些 key 的事实写 archived_at = asOf（不依赖旧事实自己的 value.expires_with 字段）。
 * 已经被归档过的事实不再处理（WHERE archived_at IS NULL）。
 */
export function expireLinkedFacts(userId: string, keysToArchive: string[], asOf: string): ExpireLinkedResult {
  logger.info(
    "调用函数-expireLinkedFacts",
    "调用函数开始：expireLinkedFacts",
    "为什么写这条日志：变体 6-D「被新事实挤掉」——直接按 keysToArchive 列表 UPDATE archived_at（不依赖旧事实自己的 value.expires_with 字段；schema 不需要新增列）。当前：拿到 keysToArchive 列表。",
    { 入参: { userId, keysToArchive, asOf } },
  );

  const t0 = Date.now();
  const archivedKeys: string[] = [];
  if (keysToArchive.length === 0) {
    return { scanned: 0, archived: 0, archivedKeys };
  }

  for (const k of keysToArchive) {
    const result = stmtSetArchived.run(asOf, userId, k);
    logger.info(
      "调用函数-expireLinkedFacts",
      "尝试归档 key=" + k,
      "为什么写这条日志：debug 单条 UPDATE 的 changes 数（changes = 0 说明库里没这条或已经归档过；changes = 1 说明成功写上 archived_at）。",
      { key: k, changes: result.changes },
    );
    if (result.changes > 0) {
      archivedKeys.push(k);
    }
  }

  const out: ExpireLinkedResult = { scanned: keysToArchive.length, archived: archivedKeys.length, archivedKeys };
  logger.info(
    "调用函数-expireLinkedFacts",
    "调用函数结束：expireLinkedFacts",
    `当前：scanned = ${keysToArchive.length}，archived = ${archivedKeys.length}。`,
    { 返回值: out, 耗时ms: Date.now() - t0, 字段释义: {
      "scanned": "尝试归档的 key 总数",
      "archived": "实际写入 archived_at 的条数（已归档过的跳过）",
      "archivedKeys": "实际被新事实挤掉的具体 key",
    } },
  );

  return out;
}
