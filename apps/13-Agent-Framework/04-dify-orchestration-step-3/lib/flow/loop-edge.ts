/**
 * 本步核心：模拟「工作流画布上的回边 + 你的次数变量」—— 圈在画布上画得出来，但执行权不归你。
 * 不调大模型（§5.3.0 例外「纯协议形状 / UI 演示」）：脚本 mock 库存查询；目的是对照"画了圈 ≠ 不让你手作圈"+"没有次数变量就一直转"。
 *
 * 职责：
 *   - runWithoutCounter(input)：画布上画了回边，但**没有**自己的次数变量 → 库存永远缺 → 一直转直到闸门触发
 *   - runWithCounter(input)：画布上画了回边 + **自己写**次数变量 → 库存缺 → 拉回 → 次数变量达上限退出
 *
 * 数据流：inStock / maxRounds → while { 查库存 → 缺 → 拉回 → ... } → { turns, rounds, stoppedReason, counterValue }。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；学习者复习时打开这一个文件能把"画了圈 ≠ 不让你手作圈"+"没有次数变量就一直转"看完。
 */
import { logger } from "../logger.js";

// ── 类型 ──

export type TurnAction = "查库存" | "拉回问客人";
export type TurnResult = "有库存" | "没库存";

export type TurnRecord = {
  round: number;
  action: TurnAction;
  result: TurnResult;
  /** 这一圈**之后**的次数变量值（无次数变量那一栏没有 counterValue） */
  counterValue?: number;
};

export type StoppedReason = "natural" | "maxRounds" | "counterLimit";

export type LoopEdgeInput = {
  /** 库存是否有货（默认 false = 一直缺，演示「一直转」的极端情况） */
  inStock?: boolean;
  /** 闸门上限（防止无限循环；教学演示用 6） */
  maxRounds?: number;
  /** 次数变量的上限（默认 3；用户调这里能看到闸门何时拉满） */
  counterLimit?: number;
};

export type LoopEdgeOutput = {
  turns: TurnRecord[];
  rounds: number;
  stoppedReason: StoppedReason;
  /** 最终次数变量值（无次数变量那一栏没有 counterValue） */
  counterValue?: number;
  counterLimit?: number;
};

// ── Mock 库存查询 ──

function mockCheckInventory(inStock: boolean | undefined): TurnResult {
  return inStock === true ? "有库存" : "没库存";
}

// ── 共享的转圈主体 ──

type RunOptions = {
  hasCounter: boolean;
  inStock: boolean;
  maxRounds: number;
  counterLimit: number;
};

function runLoop(options: RunOptions): LoopEdgeOutput {
  const { hasCounter, inStock, maxRounds, counterLimit } = options;

  const turns: TurnRecord[] = [];
  let counterValue = 0;
  let stoppedReason: StoppedReason = "natural";

  for (let round = 1; round <= maxRounds; round++) {
    // ── 这一圈 = 查库存 → 没库存 → 拉回 ──
    const inventoryResult = mockCheckInventory(inStock);

    if (inventoryResult === "有库存") {
      // 不会到这里（inStock 默认 false）；留分支以备扩展
      turns.push({ round, action: "查库存", result: "有库存", counterValue: hasCounter ? counterValue : undefined });
      stoppedReason = "natural";
      break;
    }

    // 库存不足：把这一圈的查库存 + 拉回 记进 turns
    turns.push({ round, action: "查库存", result: "没库存", counterValue: hasCounter ? counterValue : undefined });
    if (hasCounter) {
      counterValue++;
    }
    turns.push({
      round,
      action: "拉回问客人",
      result: "没库存",
      counterValue: hasCounter ? counterValue : undefined,
    });

    // ── 次数变量达上限 → 退出（这是对照左栏「没有次数变量就一直转」的关键）──
    if (hasCounter && counterValue >= counterLimit) {
      stoppedReason = "counterLimit";
      break;
    }
    // 闸门触发（防止无次数变量那一栏真的无限转）
    if (round >= maxRounds) {
      stoppedReason = "maxRounds";
    }
  }

  const out: LoopEdgeOutput = {
    turns,
    rounds: turns.filter(function (t) { return t.action === "查库存"; }).length,
    stoppedReason,
  };
  if (hasCounter) {
    out.counterValue = counterValue;
    out.counterLimit = counterLimit;
  }
  return out;
}

// ── 主流程（两个对照入口）──

/**
 * 左栏主流程：画布上画了回边，但**没有**自己的次数变量。
 * 库存一直缺 → 一圈圈拉回 → 闸门触发（默认 6 圈）。
 */
export function runWithoutCounter(input: LoopEdgeInput): LoopEdgeOutput {
  logger.info(
    "│ 调用函数-runWithoutCounter",
    "调用函数开始：runWithoutCounter",
    "为什么写这条日志：左栏主流程 —— 模拟「画布上画了回边，但没有自己的次数变量」= 一圈一圈都跑（闸门触发才停）。教学点：画了圈不代表不让你手作圈 —— 没写变量 → 一直转。",
    {
      入参: input,
      __code: "const out = runWithoutCounter({ inStock, maxRounds });",
    },
  );
  const t0 = Date.now();
  const out = runLoop({
    hasCounter: false,
    inStock: input.inStock ?? false,
    maxRounds: input.maxRounds ?? 6,
    counterLimit: 0,
  });
  logger.info(
    "│ 调用函数-runWithoutCounter",
    "调用函数结束：runWithoutCounter",
    "为什么写这条日志：左栏默认 inStock=false + maxRounds=6 = 闸门触发（maxRounds）。返回的 turns 展示「查 → 没库存 → 拉回 → 查 → 没库存 → 拉回」重复 N 次。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}

/**
 * 右栏主流程：画布上画了回边 + **自己写**了次数变量。
 * 库存一直缺 → 一圈圈拉回 → 次数变量达上限退出（默认 3 次）。
 */
export function runWithCounter(input: LoopEdgeInput): LoopEdgeOutput {
  logger.info(
    "│ 调用函数-runWithCounter",
    "调用函数开始：runWithCounter",
    "为什么写这条日志：右栏主流程 —— 模拟「画布上画了回边 + 自己写了一个次数变量」= 每拉回一次次数变量 + 1，到 counterLimit 退出（默认 3）。教学点：闸门（次数变量）归你自己写，count 不到自己不掉。",
    {
      入参: input,
      __code: "const out = runWithCounter({ inStock, maxRounds, counterLimit });",
    },
  );
  const t0 = Date.now();
  const out = runLoop({
    hasCounter: true,
    inStock: input.inStock ?? false,
    maxRounds: input.maxRounds ?? 6,
    counterLimit: input.counterLimit ?? 3,
  });
  logger.info(
    "│ 调用函数-runWithCounter",
    "调用函数结束：runWithCounter",
    "为什么写这条日志：右栏默认 inStock=false + counterLimit=3 = 拉回 3 次后退出（counterLimit）。返回的 turns 展示「查 → 没库存 → 拉回（次数变量 + 1）→ ...」→ 3 次后停。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}