/**
 * 职责：本步核心——库容量上限检查 + 自动合并（变体 7-D）。
 * 数据流：
 *   - getCapacityConfig(userId)：读阈值（存 KV key = _capacity_threshold_chars）
 *   - setCapacityConfig(userId, threshold | null)：写阈值
 *   - checkCapacity(userId)：算当前库总字符数 + 是否超阈 + 零碎事实 keys
 *   - writeAndCheck(userId, fact)：写新事实 → 检查容量 → 超阈则自动调 mergeFactsToImage 把零碎事实合并成画像（写进 user_profile_auto）
 *
 * 为什么单独成文件：笔记 §7「库有容量上限，逼着系统定期做减法」（Letta / MemGPT 设计原则）。
 * 本步用「按钮触发」代替「cron 定时」——同 demo 同端口（§5.3.14 改动很小例外）。
 *
 * 容量算法：库总字符数 = sum( JSON.stringify(fact.value).length + (fact.summary?.length ?? 0) )
 * 零碎事实定义：key 不以 user_profile_ / chat_session_ 开头（这两个是合并产物，不参与再合并）
 *
 * 与现有步骤的关系：
 *   - lib/flow/compress.ts 已有 mergeFactsToImage；本步复用它
 *   - lib/db.ts 已有 kvGet / kvSet / kvDel / kvListForDisplay / kvSetSummary；本步复用
 *   - step-12 手动合并写到 user_profile_v1；本步自动合并写到 user_profile_auto（不同 key 互不干扰）
 */
import { kvGet, kvSet, kvDel, kvListForDisplay, kvSetSummary, archiveFact } from "../db.js";
import { mergeFactsToImage } from "./compress.js";
import { logger } from "../logger.js";

const THRESHOLD_KEY = "_capacity_threshold_chars";
// 只排除 chat_session_（对话原文不参与自动合并——它已经在另一个 sub-page 处理）
// user_profile_* 不排除：它本身就是合并产物，它的 archived_at 由自己决定（默认就是 NULL）
const AUTO_MERGE_EXCLUDED_PREFIXES = ["chat_session_"];
const AUTO_MERGE_TARGET_KEY = "user_profile_auto";

export interface CapacityConfig {
  thresholdChars: number | null;   // null = 不限
}

export interface CapacityState {
  threshold: number | null;
  currentChars: number;
  factCount: number;
  scatterCount: number;
  exceeded: boolean;
  scatterKeys: string[];
}

export interface AutoMergeResult {
  state: CapacityState;          // 写入 + 合并完成后的最新状态
  merged: boolean;                // 这次是否触发了自动合并
  image?: string;
  mergedKeyCount?: number;       // 被合并的零碎事实条数
  archivedKeyCount?: number;     // 实际写了 archived_at 的条数（合并产物 user_profile_ 自己不归档，所以可能少于 mergedKeyCount）
  scatterKeys?: string[];
  modelRequest?: unknown;
  modelResponse?: unknown;
}

// ── 阈值读写 ──

export async function getCapacityConfig(userId: string): Promise<CapacityConfig> {
  const v = await kvGet(userId, THRESHOLD_KEY);
  // 阈值用裸 number 存（不是 JSON 对象）——兼容历史已写入的数字字符串
  if (typeof v === "number") return { thresholdChars: v };
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return { thresholdChars: n };
  }
  return { thresholdChars: null };
}

export async function setCapacityConfig(userId: string, thresholdChars: number | null): Promise<{ stored: boolean }> {
  if (thresholdChars === null) {
    await kvDel(userId, THRESHOLD_KEY);
    logger.info(
      "││ 调用函数-capacity-set",
      "调用函数结束：setCapacityConfig（删除阈值）",
      "为什么写这条日志：让前端知道阈值已清除、库回到不限状态。当前：删 _capacity_threshold_chars 完成。",
      { 返回值: { stored: false }, 字段释义: { "stored": "false = 已清除阈值（库回到不限状态）" } },
    );
    return { stored: false };
  }
  if (!Number.isFinite(thresholdChars) || thresholdChars < 1) {
    throw new Error("thresholdChars 必须是正整数（≥1）");
  }
  await kvSet(userId, THRESHOLD_KEY, thresholdChars);
  logger.info(
    "││ 调用函数-capacity-set",
    "调用函数结束：setCapacityConfig",
    `为什么写这条日志：让前端确认阈值已落库，下次写入会按这个阈值自动检查。当前：阈值 = ${thresholdChars} 字符。`,
    { 返回值: { stored: true, thresholdChars }, 字段释义: {
      "stored": "true = 阈值已存进 KV key = _capacity_threshold_chars",
      "thresholdChars": "库总字符数达到这个值触发自动合并",
    } },
  );
  return { stored: true };
}

// ── 容量检查 ──

export async function checkCapacity(userId: string): Promise<CapacityState> {
  const config = await getCapacityConfig(userId);
  const facts = kvListForDisplay(userId);
  // 容量检查只看「未归档 + 非对话原文」的事实 —— 归档的事实不算容量（合并之后容量应该下降）
  let totalChars = 0;
  const scatterKeys: string[] = [];
  for (const f of facts) {
    if (f.archived_at) continue;  // 归档的不算容量
    if (AUTO_MERGE_EXCLUDED_PREFIXES.some(function (p) { return f.key.startsWith(p); })) continue;  // 对话原文不算容量
    const valueLen = JSON.stringify(f.value).length;
    const summaryLen = f.summary ? f.summary.length : 0;
    totalChars += valueLen + summaryLen;
    scatterKeys.push(f.key);
  }
  const exceeded = config.thresholdChars !== null && totalChars >= config.thresholdChars;
  logger.info(
    "││ 调用函数-capacity-check",
    "调用函数结束：checkCapacity",
    `为什么写这条日志：让前端在写入前就知道「现在的库距离阈值还差多少 / 是否已经超了」。当前：库总字符 = ${totalChars}，阈值 = ${config.thresholdChars ?? "不限"}，超限 = ${exceeded}（已归档的不算容量，所以合并之后字符数会真的下降）。`,
    { 返回值: { threshold: config.thresholdChars, currentChars: totalChars, factCount: facts.length, scatterCount: scatterKeys.length, exceeded }, 字段释义: {
      "threshold": "当前阈值；null = 不限",
      "currentChars": "未归档 + 非对话原文的事实总字符数（合并之后这条会下降，因为被合并的零碎事被标了 archived_at）",
      "factCount": "库里事实总条数（含合并产物 + 归档的事）",
      "scatterCount": "未归档且非对话原文的事实条数（即会被自动合并的目标）",
      "exceeded": "true = 当前已超限；下次写入会触发自动合并",
    } },
  );
  return {
    threshold: config.thresholdChars,
    currentChars: totalChars,
    factCount: facts.length,
    scatterCount: scatterKeys.length,
    exceeded,
    scatterKeys,
  };
}

// ── 写入 + 检查 + 自动合并（本步最关键的一跳）──

export async function writeAndCheck(
  userId: string,
  fact: { key: string; value: unknown },
): Promise<AutoMergeResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-capacity-writeAndCheck",
    "调用函数开始：writeAndCheck",
    "为什么写这条日志：第 7 关变体 7-D——写入新事实后立刻检查容量，超阈值自动合并。本步是「库有容量上限逼着系统定期做减法」的演示入口。",
    { 入参: { userId, key: fact.key }, __code: "await kvSet(userId, fact.key, fact.value);" },
  );

  // ① 先把新事实写进库
  await kvSet(userId, fact.key, fact.value);

  // ② 检查容量
  const stateBefore = await checkCapacity(userId);

  if (!stateBefore.exceeded || stateBefore.scatterKeys.length === 0) {
    logger.info(
      "调用函数-capacity-writeAndCheck",
      "调用函数结束：writeAndCheck（未触发合并）",
      `为什么写这条日志：要让前端知道这次没合并——库还在阈值内、或者没零碎事实可合并。当前：库总字符 = ${stateBefore.currentChars}，超限 = ${stateBefore.exceeded}。`,
      { 返回值: { state: stateBefore, merged: false }, 耗时ms: Date.now() - t0 },
    );
    return { state: stateBefore, merged: false };
  }

  // ③ 超阈值 + 有零碎事实 → 调 mergeFactsToImage 自动合并 + 覆盖写回 user_profile_auto + 归档被合并的零碎事
  logger.info(
    "││ 调用模型-capacity-mergeFactsToImage",
    "调用模型开始：mergeFactsToImage（自动合并）",
    `为什么写这条日志：库超阈值了，自动把 ${stateBefore.scatterKeys.length} 条零碎事实合并成一段用户画像，覆盖写回 ${AUTO_MERGE_TARGET_KEY}。当前：scatterKeys = ${JSON.stringify(stateBefore.scatterKeys)}。`,
    { 入参: { userId, keys: stateBefore.scatterKeys }, __code: "const imageResult = await mergeFactsToImage(userId, stateBefore.scatterKeys);" },
  );
  const imageResult = await mergeFactsToImage(userId, stateBefore.scatterKeys);
  kvSetSummary(userId, AUTO_MERGE_TARGET_KEY, imageResult.image);

  // ③b 把被合并的零碎事标 archived_at（笔记 §6「过期 ≠ 删除」原则：归档后召回看不见，但归档视图可见）
  // 这样下次 checkCapacity 算字符数时这些事会被排除 → 容量真的下降（不是加了 image 反而涨）
  const archivedAt = new Date().toISOString();
  const archivedKeys: string[] = [];
  for (const k of stateBefore.scatterKeys) {
    // user_profile_* 不归档（合并产物自己不算自己的散乱事实；archive 是给合并源的）
    if (k.startsWith("user_profile_")) continue;
    const r = archiveFact(userId, k, archivedAt);
    if (r.changes > 0) archivedKeys.push(k);
  }

  // ④ 重新算容量（合并后库状态变了 —— 被合并的事已归档，字符数应该降）
  const stateAfter = await checkCapacity(userId);

  logger.info(
    "调用函数-capacity-writeAndCheck",
    "调用函数结束：writeAndCheck（已自动合并）",
    `为什么写这条日志：要让前端知道这次自动合并了——把 ${stateBefore.scatterKeys.length} 条零碎事合并成画像、覆盖写回 ${AUTO_MERGE_TARGET_KEY}、归档了 ${archivedKeys.length} 条。当前：合并前 ${stateBefore.currentChars} 字符 → 合并后 ${stateAfter.currentChars} 字符（已归档的不算容量），超限 = ${stateAfter.exceeded}。`,
    { 返回值: { state: stateAfter, merged: true, imageLength: imageResult.imageLength, mergedKeyCount: stateBefore.scatterKeys.length, archivedKeyCount: archivedKeys.length }, 耗时ms: Date.now() - t0 },
  );

  return {
    state: stateAfter,
    merged: true,
    image: imageResult.image,
    mergedKeyCount: stateBefore.scatterKeys.length,
    archivedKeyCount: archivedKeys.length,
    scatterKeys: stateBefore.scatterKeys,
    modelRequest: imageResult.modelRequest,
    modelResponse: imageResult.modelResponse,
  };
}