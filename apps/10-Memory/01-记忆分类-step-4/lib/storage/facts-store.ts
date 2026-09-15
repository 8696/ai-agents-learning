/**
 * 本步核心（写入那一段）：把分类结果按规则真的写到磁盘上的事实库，并提供读 / 清空。
 *
 * 写入侧 3 道把关（3 个独立维度联合裁定，任一不过 → 不写）：
 *   - 维度 A：是不是事实？（工作记忆 / 程序性 → 不写）
 *   - 维度 B：跨会话还有用吗？（短期 → 不写）
 *   - 维度 C：值不值得占存储？（跟已有事实完全重复 → 跳过；公开常识 → 不写）
 *   详见小节文档 01-记忆分类.md 「易混」§7「写入策略」。
 *
 * 职责：
 *   1. 走 3 道把关判定一条分类结果该不该写入
 *   2. 写入 data/facts.json（追加式 KV；key = sentence 归一化；同 key 已存在 → 内容不同则覆盖，内容完全一致则跳过）
 *   3. 列出当前事实库所有事实
 *   4. 清空事实库（演示用）
 *
 * 数据流：
 *   recordIfLongTerm(classifyResult, sentence)
 *     → 读 facts.json（不存在则初始化空数组）
 *     → 走 3 道把关（A: 是不是事实 / B: 跨会话还有用吗 / C: 值不值得占存储）
 *     → 任一不过 → 直接返回不写
 *     → 三道齐 → 同 key 已存在 → 内容完全一致：跳过；内容不同：覆盖；新 key：追加
 *     → 写回 facts.json
 *     → 返回 { written, reason, key?, fact? }
 *
 * 写入路径：apps/10-Memory/01-记忆分类-step-2/data/facts.json
 *
 * 为什么 key = sentence 归一化而不是时间戳：同一句用户原话反复出现应该被识别为同一事实；
 * 用时间戳每次都生成新 key，长期事实库会被噪音填满。这是语义记忆「可覆盖」更新语义的最朴素实现。
 *
 * 写入规则的来由：见小节文档 01-记忆分类.md 「易混」§7
 * 「不区分短期和长期 → 两个方向都出事」——短期内容写入会污染长期事实库（维度 B 没挡就出事）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FACTS_FILE = path.resolve(__dirname, "..", "..", "data", "facts.json");

export interface PersistDecision {
  written: boolean;
  reason: string;
  /** 仅在 written === true 时存在 */
  key?: string;
  /** 仅在 written === true 时存在；整条事实，便于上层上页展示 */
  fact?: PersistedFact;
}

export interface PersistedFact {
  /** 用户原话归一化后的稳定键（去前后空格、压连续空白、转小写） */
  key: string;
  /** 原始用户原话 */
  sentence: string;
  /** 四类记忆里的哪一类 */
  memoryType: string;
  /** 短期 / 长期 */
  term: string;
  /** 模型给的归类理由 */
  reason: string;
  /** 写入时刻（ISO 字符串） */
  recordedAt: string;
}

// ── 工具：把用户原话归一成稳定 key ──
function normalizeKey(sentence: string): string {
  return sentence.trim().replace(/\s+/g, " ").toLowerCase();
}

// ── 工具：读 / 写 facts.json（不存在则初始化空数组） ──
export function readFacts(): PersistedFact[] {
  try {
    const raw = fs.readFileSync(FACTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PersistedFact[]) : [];
  } catch (error: unknown) {
    const e = error as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return [];
    throw new Error(`读事实库失败：${e.message ?? String(error)}`);
  }
}

function writeFacts(facts: PersistedFact[]): void {
  fs.mkdirSync(path.dirname(FACTS_FILE), { recursive: true });
  fs.writeFileSync(FACTS_FILE, JSON.stringify(facts, null, 2), "utf8");
}

export { writeFacts };

// ── 公开常识清单（演示用；真实产品应该由 RAG 检索 + 知识库比对代替硬编码） ──
// 命中其中任一条 → 维度 C 拦下，判定为不写（公开常识不是记忆的事，让 RAG 干）
const PUBLIC_KNOWLEDGE = [
  "北京是首都",
  "巴黎是法国的首都",
  "地球是圆的",
  "1+1=2",
];

/**
 * 走 3 道独立维度联合裁定一条分类结果该不该写入事实库。
 * 任一维度不过 → 不写；三道齐 → 写。
 *
 *   - 维度 A：是不是事实？（工作记忆 / 程序性 → 不写）
 *   - 维度 B：跨会话还有用吗？（短期 → 不写）
 *   - 维度 C：值不值得占存储？（同 key 内容完全一致 → 跳过；公开常识 → 不写）
 */
function shouldWrite(args: {
  memoryType: string;
  term: string;
  sentence: string;
  reason: string;
  existingFacts: PersistedFact[];
}): { ok: boolean; reason: string } {
  // ── 维度 A：是不是事实？──
  // 工作记忆 = 当前任务进行中的临时信息；程序性记忆 = 全员通用规则不属于某个用户
  if (args.memoryType === "工作记忆") {
    return { ok: false, reason: "维度 A 不过：工作记忆只在当前这一小段过程里有用，不写" };
  }
  if (args.memoryType === "程序性记忆") {
    return { ok: false, reason: "维度 A 不过：程序性记忆是全员规则，不该落进用户事实库（属下一小节「写入策略」详细讲解）" };
  }

  // ── 维度 B：跨会话还有用吗？──
  // 短期 = 只在本轮内有效，重启进程后无意义；写盘侧尊重模型给出的 term 字段
  if (args.term === "短期") {
    return { ok: false, reason: "维度 B 不过：短期记忆只在本轮内有效，不写" };
  }

  // ── 维度 C：值不值得占存储？──
  // C1：跟库里已有同 key 内容完全一致 → 跳过（重复内容，不产生新价值）
  const key = normalizeKey(args.sentence);
  const existing = args.existingFacts.find((f) => f.key === key);
  if (existing) {
    const 内容完全一致 =
      existing.memoryType === args.memoryType &&
      existing.term === args.term &&
      existing.reason === args.reason &&
      existing.sentence === args.sentence;
    if (内容完全一致) {
      return { ok: false, reason: "维度 C 不过：跟库里已有那条完全重复，不写（同 key 自动去重）" };
    }
    // 同 key 但内容不同 → 不在这一步拦，后面 recordIfLongTerm 走覆盖分支（语义记忆「可更新」核心需求）
  }
  // C2：公开常识 → 不写（这是 RAG 该干的事，不是记忆的事）
  if (PUBLIC_KNOWLEDGE.some((p) => args.sentence.includes(p))) {
    return { ok: false, reason: "维度 C 不过：公开常识 / 检索能查到，不是记忆的事" };
  }

  // ── 三道齐 → 写 ──
  return { ok: true, reason: "三道齐：长期 + 是事实 + 不重复 / 非公开常识 → 写入事实库" };
}

/**
 * 把一条分类结果按 3 道把关裁定后写入事实库。
 * 返回 { written, reason, fact?, key? }，调用方按结果上页展示。
 */
export function recordIfLongTerm(args: {
  sentence: string;
  memoryType: string;
  term: string;
  reason: string;
}): PersistDecision {
  const { sentence, memoryType, term, reason } = args;
  const t0 = Date.now();
  logger.info(
    "│ 写入判定-事实库",
    "调用函数开始：recordIfLongTerm",
    "为什么写这条日志：要把分类结果按 3 道把关（维度 A 是不是事实 + 维度 B 跨会话还有用吗 + 维度 C 值不值得占存储）联合裁定该不该写。当前：收到一条刚出炉的分类结果。",
    { 入参: args, __code: "const decision = recordIfLongTerm({ sentence, memoryType, term, reason });" },
  );

  // 3 道把关的维度 C 需要看到现有事实库（重复内容判定要拿已有 key 比对），所以先读一次
  const existingFacts = readFacts();
  const verdict = shouldWrite({ memoryType, term, sentence, reason, existingFacts });
  if (!verdict.ok) {
    logger.info(
      "│ 写入判定-事实库",
      "调用函数结束：recordIfLongTerm（不写盘）",
      "为什么写这条日志：要让页面能看到「哪一道把关拦下这条 + 为什么」的明确理由（维度 A/B/C 任一不过就拦）。当前：判定为不写，直接返回。",
      { 返回值: { written: false, reason: verdict.reason }, 耗时ms: Date.now() - t0 },
    );
    return { written: false, reason: verdict.reason };
  }

  const key = normalizeKey(sentence);
  const fact: PersistedFact = {
    key,
    sentence,
    memoryType,
    term,
    reason,
    recordedAt: new Date().toISOString(),
  };

  // 同 key 已存在但内容不同 → 覆盖（语义记忆「可覆盖、可更新」的核心需求）；新 key → 追加
  const filtered = existingFacts.filter((f) => f.key !== key);
  filtered.push(fact);
  writeFacts(filtered);

  logger.info(
    "│ 写入判定-事实库",
    "调用函数结束：recordIfLongTerm（已写盘）",
    "为什么写这条日志：要让页面能看到「这条真的写到哪了 + 跟之前那条同 key 的覆盖关系」。当前：facts.json 已更新。",
    {
      返回值: {
        written: true,
        reason: verdict.reason,
        key,
        fact,
        totalFacts: filtered.length,
        filePath: FACTS_FILE,
      },
      耗时ms: Date.now() - t0,
      字段释义: {
        key: "用户原话归一化后的稳定键（去前后空格、压连续空白、转小写）",
        recordedAt: "写入时刻（ISO 时间）",
        totalFacts: "事实库当前总条数",
        filePath: "实际写入的 JSON 文件路径",
      },
    },
  );

  return { written: true, reason: verdict.reason, key, fact };
}

/** 读出当前事实库（页面实时列表 + 重启验证的对照来源）。 */
export function listFacts(): { facts: PersistedFact[]; filePath: string } {
  const t0 = Date.now();
  logger.info(
    "│ 写入判定-事实库",
    "调用函数开始：listFacts",
    "为什么写这条日志：页面要实时看到事实库列表（重启后能对照「这条还在」）。当前：用户点了刷新 / 刚加载页面。",
    {},
  );
  const facts = readFacts();
  logger.info(
    "│ 写入判定-事实库",
    "调用函数结束：listFacts",
    "为什么写这条日志：要让页面拿到完整事实列表（含每条的 key / memoryType / term / reason / recordedAt）。当前：即将返回。",
    { 返回值: { facts, filePath: FACTS_FILE, count: facts.length }, 耗时ms: Date.now() - t0 },
  );
  return { facts, filePath: FACTS_FILE };
}

/** 清空事实库（演示用：让学习者能反复试「写入 → 重启 → 还在」）。 */
export function clearFacts(): { cleared: number; filePath: string } {
  const t0 = Date.now();
  logger.info(
    "│ 写入判定-事实库",
    "调用函数开始：clearFacts",
    "为什么写这条日志：演示用——清空事实库，让学习者能反复试「写入 → 重启 → 还在」。当前：用户点了清空。",
    {},
  );
  const facts = readFacts();
  writeFacts([]);
  logger.info(
    "│ 写入判定-事实库",
    "调用函数结束：clearFacts",
    "为什么写这条日志：要让页面看到清空了几条、目标文件在哪。当前：facts.json 已被写成空数组。",
    { 返回值: { cleared: facts.length, filePath: FACTS_FILE }, 耗时ms: Date.now() - t0 },
  );
  return { cleared: facts.length, filePath: FACTS_FILE };
}