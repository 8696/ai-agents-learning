/**
 * 本步核心：模拟「代码节点 + 输出变量」—— 局部变量函数返回就丢，要进全图状态必须写成「输出变量」。
 * 不调大模型（§5.3.0 例外「纯协议形状 / UI 演示」）：脚本 mock 定价；目的是对照「局部变量函数返回丢 / 输出变量才进全图状态」。
 *
 * 职责：
 *   - runCodeNodeWithOutput(input)：代码节点算出 price 并把 price 写到「输出变量 outputVars.price」→ 下游能读到
 *   - runCodeNodeWithoutOutput(input)：代码节点算出 price 但忘了写输出变量 → 下游读不到 price
 *
 * 数据流：{ cupSize, drinkType } → mock 计算 price → { priceInCode, outputVars, note }。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；这是和 step-3 / step-4 同类的对照 ——「画了 / 写了 ≠ 暴露给全图状态」。
 */
import { logger } from "../logger.js";

// ── 类型 ──

export type CupSize = "大杯" | "中杯" | "小杯";
export type DrinkType = "热饮" | "冰饮";

export type CodeNodeInput = {
  cupSize: CupSize;
  drinkType: DrinkType;
};

export type CodeNodeOutput = {
  cupSize: CupSize;
  drinkType: DrinkType;
  /** 代码节点内部计算出的 price（局部变量）—— 函数返回就丢 */
  priceInCode: number;
  /** 输出变量（outputVars）—— 引擎合并进全图状态，下游能读到 */
  outputVars: Record<string, unknown>;
  /** 一句话讲清为什么下游读得到 / 读不到 */
  note: string;
};

// ── Mock 定价（对照模块 11 状态机里"价格计算节点"的输入输出）──

const BASE = 28;
const SIZE_EXTRA: Record<CupSize, number> = { "大杯": 8, "中杯": 6, "小杯": 4 };
const TEMP_EXTRA: Record<DrinkType, number> = { "热饮": 0, "冰饮": 2 };

function computePrice(cupSize: CupSize, drinkType: DrinkType): number {
  // 「局部变量 price」—— 离开这个函数就丢；下游能不能读到 = 看有没有写到 outputVars
  const price = BASE + SIZE_EXTRA[cupSize] + TEMP_EXTRA[drinkType];
  return price;
}

// ── 左栏主流程：写出输出变量 ──

export function runCodeNodeWithOutput(input: CodeNodeInput): CodeNodeOutput {
  logger.info(
    "│ 调用函数-runCodeNodeWithOutput",
    "调用函数开始：runCodeNodeWithOutput",
    "为什么写这条日志：左栏主流程 —— 代码节点算出 price 并写到「输出变量 outputVars.price」。教学点：必须显式写进输出变量，引擎才会合并进全图状态，下游能读到。",
    {
      入参: input,
      __code: "const out = runCodeNodeWithOutput({ cupSize, drinkType });",
    },
  );
  const t0 = Date.now();

  const priceInCode = computePrice(input.cupSize, input.drinkType);
  // ── 关键：把 price 写进 outputVars → 下游能读到 ──
  const outputVars: Record<string, unknown> = {
    cupSize: input.cupSize,
    drinkType: input.drinkType,
    price: priceInCode,
  };
  const note = "代码节点里算了 price，**且写进了输出变量 outputVars.price** → 下游节点能读到 price。";

  const out: CodeNodeOutput = { cupSize: input.cupSize, drinkType: input.drinkType, priceInCode, outputVars, note };

  logger.info(
    "│ 调用函数-runCodeNodeWithOutput",
    "调用函数结束：runCodeNodeWithOutput",
    "为什么写这条日志：左栏把 price 写进 outputVars → 下游能读到。前端用 outputVars.price 对照右栏。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}

// ── 右栏主流程：忘了写输出变量 ──

export function runCodeNodeWithoutOutput(input: CodeNodeInput): CodeNodeOutput {
  logger.info(
    "│ 调用函数-runCodeNodeWithoutOutput",
    "调用函数开始：runCodeNodeWithoutOutput",
    "为什么写这条日志：右栏主流程 —— 代码节点算出 price 但忘了写输出变量 → 下游读不到 price。教学点：函数返回就丢（局部变量 price 在函数返回后消失）；下游能不能读到 = 看有没有写到 outputVars。",
    {
      入参: input,
      __code: "const out = runCodeNodeWithoutOutput({ cupSize, drinkType });",
    },
  );
  const t0 = Date.now();

  const priceInCode = computePrice(input.cupSize, input.drinkType);
  // ── 关键：忘了写 price → 下游读不到 ──
  const outputVars: Record<string, unknown> = {
    cupSize: input.cupSize,
    drinkType: input.drinkType,
    // 没写 price
  };
  const note = "代码节点里算了 price（局部变量 priceInCode = " + priceInCode + "），**但忘了写进输出变量** → 下游读不到 price；只能读到 cupSize / drinkType。";

  const out: CodeNodeOutput = { cupSize: input.cupSize, drinkType: input.drinkType, priceInCode, outputVars, note };

  logger.info(
    "│ 调用函数-runCodeNodeWithoutOutput",
    "调用函数结束：runCodeNodeWithoutOutput",
    "为什么写这条日志：右栏 price 算成了但没暴露给 outputVars → 下游读不到。前端用 outputVars 是否含 price 对照左栏。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}