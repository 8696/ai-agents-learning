/**
 * 职责：按 key 删除单条事实（让学习者能逐条删除误写的事实，不是清空）。
 * 数据流：key → 从 facts.json 读出全部 → 过滤掉同 key 的 → 写回。
 *
 * 为什么单独成文件：让 facts-store.ts 主文件行数 ≤ 280（§5.3.8 行数硬上限）。
 */
import { logger } from "../logger.js";
import { FACTS_FILE, readFacts, writeFacts } from "./facts-store.js";

export function deleteFact(key: string): { removed: boolean; remainingCount: number } {
  const t0 = Date.now();
  logger.info(
    "│ 写入判定-事实库",
    "调用函数开始：deleteFact",
    "为什么写这条日志：让学习者能逐条删除误写的事实（不是一键清空）。当前：用户点了某条事实的删除按钮。",
    { 入参: { key }, __code: "const r = deleteFact(key);" },
  );
  const facts = readFacts();
  const filtered = facts.filter((f) => f.key !== key);
  const removed = filtered.length !== facts.length;
  writeFacts(filtered);
  logger.info(
    "│ 写入判定-事实库",
    "调用函数结束：deleteFact",
    "为什么写这条日志：要让页面看到这条有没有真的被删掉、剩余几条。当前：facts.json 已更新。",
    { 返回值: { removed, remainingCount: filtered.length, filePath: FACTS_FILE }, 耗时ms: Date.now() - t0 },
  );
  return { removed, remainingCount: filtered.length };
}