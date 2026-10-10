/**
 * 本步核心：模拟「人工方块」vs「人工方块 + checkpoint + idempotency」—— 进程杀掉后能不能重复扣款。
 * 不调大模型（§5.3.0 例外「纯协议形状 / UI 演示」）：脚本用 mock KV 模拟「持久化层」（实际生产用 SQLite / better-sqlite3）。
 *
 * 职责：
 *   - runHumanApprovalOnly(input)：流程 = 等人工点头 + 调扣款。**没**写 checkpoint，**没**做 idempotency 去重 → 进程杀掉后重启会重复扣款
 *   - runHumanApprovalWithCheckpoint(input)：流程 = 等人工点头 + 写 checkpoint + 调扣款（带 idempotency_key）。进程杀掉后重启能恢复 + 不重复扣款
 *
 * 数据流：{ refundRequestId, amount, killBeforeCharge } → 等点头 → 写检查点（仅右栏）→ 调扣款 → { chargedTimes, checkpointPersisted, idempotencyApplied, steps }。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；这是和 step-7 「人工方块 ≠ 检查点」对照的核心 —— "等点头" 方块在产品里只表示暂停，不能代替模块 11 的 checkpoint + idempotency。
 */
import { logger } from "../logger.js";

// ── Mock 持久化层（模拟「进程杀掉能恢复」+「按调用编号去重」）──
// 真实生产会用 SQLite / better-sqlite3（见模块 11 · 02 Checkpoint），但本步演示形状：
// 「checkpoint 持久化」+「idempotency 去重」是两件分开做的事。

const STORE = {
  /** 流程状态 checkpoint：key = refundRequestId，value = { stage: 'approved', amount, ts } */
  checkpoints: new Map<string, { stage: string; amount: number; ts: number }>(),
  /** 扣款记录：key = 'charge:' + idempotencyKey（= refundRequestId），value = { amount, ts } */
  charges: new Map<string, { amount: number; ts: number }>(),
};

// ── 类型 ──

export type ScenarioInput = {
  /** idempotency_key：同一笔退款重发时 = 同一 refundRequestId */
  refundRequestId: string;
  /** 退款金额（元） */
  amount: number;
  /** kill 阶段模拟：
   *  - 'none' = 不模拟，正常流程
   *  - 'before-charge' = 等点头 + 写 checkpoint 之后，调扣款**之前**模拟进程杀掉
   *    （左栏不会写 checkpoint；右栏已写 checkpoint + idempotency 待验证）
   */
  killAt: "none" | "before-charge";
};

export type ScenarioOutput = {
  refundRequestId: string;
  amount: number;
  /** 人类是否已点头（mock 直接 true；真实场景走审批流） */
  humanApproved: boolean;
  /** 实际扣了几次（含 0 / 1 / 2） */
  chargedTimes: number;
  /** 这次调用发生时 STORE 里有没有这个 refundRequestId 的 checkpoint */
  hadCheckpointBefore: boolean;
  /** 步骤列表（按时间顺序）—— 学习者一眼看见流程 */
  steps: string[];
  /** 判据：一句人话讲清这一栏会发生什么 */
  note: string;
  /** 检查点是否真的被持久化（key = refundRequestId 写进了 STORE.checkpoints） */
  checkpointPersisted: boolean;
  /** idempotency 是否真的生效（key = 'charge:' + refundRequestId 已写进了 STORE.charges；第二次调不再扣） */
  idempotencyApplied: boolean;
};

// ── Mock 扣款工具（带 idempotency_key）──

function mockCharge(idempotencyKey: string, amount: number): { chargedTimes: number } {
  const storeKey = "charge:" + idempotencyKey;
  if (STORE.charges.has(storeKey)) {
    // 已经扣过，按 idempotency_key 去重 → 不重复扣
    return { chargedTimes: 0 };
  }
  STORE.charges.set(storeKey, { amount, ts: Date.now() });
  return { chargedTimes: 1 };
}

// ── Mock 检查点存 / 取 ──

function saveCheckpoint(refundRequestId: string, stage: string, amount: number): void {
  STORE.checkpoints.set(refundRequestId, { stage, amount, ts: Date.now() });
}

function loadCheckpoint(refundRequestId: string): { stage: string; amount: number; ts: number } | undefined {
  return STORE.checkpoints.get(refundRequestId);
}

// ── Mock STORE 重置（调试用 · API 暴露）──

export function resetStore(): void {
  STORE.checkpoints.clear();
  STORE.charges.clear();
}

// ── 左栏主流程：仅人工方块 ──

/**
 * 流程：等人工点头 → 调扣款。
 * 没写 checkpoint + 没做 idempotency → 进程杀掉后重启 = 重新等点头 + 重新扣款 = 重复扣款。
 */
export function runHumanApprovalOnly(input: ScenarioInput): ScenarioOutput {
  logger.info(
    "│ 调用函数-runHumanApprovalOnly",
    "调用函数开始：runHumanApprovalOnly",
    "为什么写这条日志：左栏主流程 —— 流程 = 等人工点头 + 调扣款，**没**写 checkpoint + **没**做 idempotency。教学点：「人工方块 ≠ 检查点 + idempotency」—— 进程杀掉后重启 = 重新等点头 + 重新扣款 = 重复扣款。",
    {
      入参: input,
      __code: "const out = runHumanApprovalOnly({ refundRequestId, amount, killAt });",
    },
  );
  const t0 = Date.now();

  const steps: string[] = [];
  let chargedTimes = 0;

  steps.push(`1. 流程进到「等人工点头」（人设自动点头 = true）`);
  const humanApproved = true;

  if (input.killAt === "before-charge") {
    steps.push(`2. **进程被杀掉**（在调扣款之前）—— 左栏没写 checkpoint，进程杀掉 = 全丢`);
    steps.push(`3. **重启进程** —— 流程重新跑：再等人工点头 + 再调扣款`);
    steps.push(`4. 再调扣款（idempotency_key = ${input.refundRequestId}）—— 但左栏没检查 idempotency → 真扣了`);
  } else {
    steps.push(`2. 调扣款工具（idempotency_key = ${input.refundRequestId}）—— 但左栏没检查 idempotency → 真扣了`);
  }

  // 调扣款
  const charge = mockCharge(input.refundRequestId, input.amount);
  chargedTimes += charge.chargedTimes;
  steps.push(`5. 本次调用扣款结果：chargedTimes = ${charge.chargedTimes}`);

  // 左栏：永远不写 checkpoint（这就是 bug —— 没保护）
  const checkpointPersisted = false;
  const idempotencyApplied = false;

  const hadCheckpointBefore = false; // 左栏没检查过

  let note: string;
  if (input.killAt === "before-charge") {
    note = "kill 阶段模拟 before-charge：左栏**没**写 checkpoint + **没**做 idempotency → 进程杀掉后重启 = 重复扣款。「人工方块」只表示「暂停等人点头」，不能代替检查点。";
  } else {
    note = "正常流程（没模拟 kill）：左栏**没**写 checkpoint + **没**做 idempotency → 进程杀掉后下次重启会重复扣款。";
  }

  const out: ScenarioOutput = {
    refundRequestId: input.refundRequestId,
    amount: input.amount,
    humanApproved,
    chargedTimes,
    hadCheckpointBefore,
    steps,
    note,
    checkpointPersisted,
    idempotencyApplied,
  };

  logger.info(
    "│ 调用函数-runHumanApprovalOnly",
    "调用函数结束：runHumanApprovalOnly",
    "为什么写这条日志：左栏没写 checkpoint + 没做 idempotency；kill 阶段 = before-charge 时本次调用就重复扣了。前端用 chargedTimes > 1 + checkpointPersisted=false 对照右栏。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}

// ── 右栏主流程：人工方块 + checkpoint + idempotency ──

/**
 * 流程：
 *   1. 看 checkpoint：如果 STORE 里有这个 refundRequestId → 已等过点头 → 跳过
 *   2. 否则 → 等人工点头 → 写 checkpoint（stage = "approved"）
 *   3. 调扣款（带 idempotency_key = refundRequestId）：如果已扣过 → 去重；否则扣 + 记
 *
 * 进程杀掉 + 重启：checkpoint + idempotency 都在 STORE → 不重复扣款。
 */
export function runHumanApprovalWithCheckpoint(input: ScenarioInput): ScenarioOutput {
  logger.info(
    "│ 调用函数-runHumanApprovalWithCheckpoint",
    "调用函数开始：runHumanApprovalWithCheckpoint",
    "为什么写这条日志：右栏主流程 —— 等人工点头 + 写 checkpoint + 调扣款（带 idempotency_key）。教学点：进程杀掉后重启能恢复 + 不重复扣款 = checkpoint 持久化 + 按调用编号去重（idempotency_key）。",
    {
      入参: input,
      __code: "const out = runHumanApprovalWithCheckpoint({ refundRequestId, amount, killAt });",
    },
  );
  const t0 = Date.now();

  const steps: string[] = [];
  let chargedTimes = 0;
  let humanApproved = false;
  let hadCheckpointBefore = false;

  // ── 1. 检查 checkpoint：是否已等过点头？──
  const existing = loadCheckpoint(input.refundRequestId);
  if (existing) {
    hadCheckpointBefore = true;
    humanApproved = true;
    steps.push(`1. STORE 里有 checkpoint（stage = ${existing.stage}）→ 已等过点头 → 跳过`);
  } else {
    steps.push(`1. STORE 里没有 checkpoint → 流程进到「等人工点头」（人设自动点头 = true）`);
    humanApproved = true;
    steps.push(`2. 人工点头 → 写 checkpoint（stage = "approved"）→ key = ${input.refundRequestId}`);
    saveCheckpoint(input.refundRequestId, "approved", input.amount);
  }

  // ── 2. kill 阶段模拟 ──
  if (input.killAt === "before-charge") {
    steps.push(`3. **进程被杀掉**（在调扣款之前）—— 右栏已写 checkpoint（"approved"）→ 重启能恢复`);
    steps.push(`4. **重启进程** —— 流程恢复：checkpoint 已写 → 跳过点头，直接调扣款`);
  } else {
    steps.push(`3. 调扣款工具（idempotency_key = ${input.refundRequestId}）—— 检查 STORE.charges；右栏**检查了 idempotency**`);
  }

  // ── 3. 调扣款（带 idempotency_key 检查）──
  const charge = mockCharge(input.refundRequestId, input.amount);
  chargedTimes += charge.chargedTimes;
  steps.push(`5. 扣款结果：chargedTimes = ${charge.chargedTimes}（${charge.chargedTimes === 1 ? "真扣了" : "按 idempotency 去重 → 没真扣"}）`);

  const checkpointPersisted = STORE.checkpoints.has(input.refundRequestId);
  const idempotencyApplied = STORE.charges.has("charge:" + input.refundRequestId);

  let note: string;
  if (input.killAt === "before-charge") {
    note = "kill 阶段模拟 before-charge：右栏**已**写 checkpoint + **已**做 idempotency → 进程杀掉后重启 = 不重复扣款。「等点头」方块（产品界面）不是检查点；你自己写的 checkpoint + idempotency 才是。";
  } else {
    note = "正常流程（没模拟 kill）：右栏**已**写 checkpoint + **已**做 idempotency；进程杀掉后下次重启 = 不重复扣款。";
  }

  const out: ScenarioOutput = {
    refundRequestId: input.refundRequestId,
    amount: input.amount,
    humanApproved,
    chargedTimes,
    hadCheckpointBefore,
    steps,
    note,
    checkpointPersisted,
    idempotencyApplied,
  };

  logger.info(
    "│ 调用函数-runHumanApprovalWithCheckpoint",
    "调用函数结束：runHumanApprovalWithCheckpoint",
    "为什么写这条日志：右栏 kill 阶段 = before-charge 时本次调用就能恢复 + 不重复扣。前端用 chargedTimes=1（不论调几次）+ checkpointPersisted=true + idempotencyApplied=true 对照左栏。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}