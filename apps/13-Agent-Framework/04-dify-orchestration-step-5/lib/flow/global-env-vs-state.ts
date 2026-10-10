/**
 * 本步核心（step-5 加 page · 补 §5.4.B 易混 6 + 踩坑 7 缺口）：演示「把密钥写成这一趟订单的状态 / 把杯型写成全局环境变量」的可观察反例。
 *
 * 职责：
 *   - runStateInDeclaredState(input)：正确 —— 把状态写在 declared state 里（不污染全局）
 *   - runStatePollutedToGlobal(input)：反例 —— 把 cupSize + 密钥 写进 mock 的 GLOBAL_CONFIG（模拟「把状态写进 process.env」），下一次跑会被上一次污染
 *
 * 数据流：{ cupSize, drinkType } → 各自处理 → { pollutedKey, pollutedValue, crossRunContamination }。
 *
 * 为什么 step-5 加 page：§5.3.14 「改动很小」例外 —— 端口 50158 不变；本步核心是「不能把这一趟的字段放进全局」，跨 step-5 的「输出变量」同一上下文（都是「状态在哪」对照）。
 */
import { logger } from "../logger.js";

// ── 类型 ──

export type CupSize = "大杯" | "中杯" | "小杯";
export type DrinkType = "热饮" | "冰饮";

export type GlobalStateInput = {
  cupSize: CupSize;
  drinkType: DrinkType;
};

// ── Mock 全局配置（模拟「把状态写进 process.env」的反例污染）──
// 真实生产：process.env.GLOBAL_CUP_SIZE = "大杯" —— 全局的；下一次跑会读到上一次的。
const GLOBAL_CONFIG = new Map<string, string>();

// ── Mock 计算价格（与 step-5 共享 BASE + SIZE_EXTRA + TEMP_EXTRA）──

const BASE = 28;
const SIZE_EXTRA: Record<CupSize, number> = { "大杯": 8, "中杯": 6, "小杯": 4 };
const TEMP_EXTRA: Record<DrinkType, number> = { "热饮": 0, "冰饮": 2 };

function computePrice(cupSize: CupSize, drinkType: DrinkType): number {
  return BASE + SIZE_EXTRA[cupSize] + TEMP_EXTRA[drinkType];
}

// ── 左栏：把状态写在 declared state 里（正确）──

export type GlobalStateOutput = {
  cupSize: CupSize;
  drinkType: DrinkType;
  price: number;
  /** 这一趟的 declared state（在仓库里 declared 的字段） */
  declaredState: Record<string, unknown>;
  /** 这次跑是不是污染了 GLOBAL_CONFIG */
  pollutedGlobalConfig: boolean;
  /** 如果污染了，污染的键和值 */
  pollutedKey: string | null;
  pollutedValue: string | null;
  /** 全局配置现在的状态（用于对照「下轮是否被污染」） */
  globalConfigSnapshot: Record<string, string>;
  /** 意图一句话 */
  note: string;
};

export function runStateInDeclaredState(input: GlobalStateInput): GlobalStateOutput {
  logger.info(
    "│ 调用函数-runStateInDeclaredState",
    "调用函数开始：runStateInDeclaredState",
    "为什么写这条日志：左栏主流程 —— 状态写在 declared `OrderState` 里（仓库里 declared 的字段）。教学点：这一趟的字段归这一趟，不污染全局；下一次跑读不到上一次的 cupSize。",
    {
      入参: input,
      __code: "const out = runStateInDeclaredState({ cupSize, drinkType });",
    },
  );
  const t0 = Date.now();

  const price = computePrice(input.cupSize, input.drinkType);
  // ── 关键：状态写在 declared state 里，不写全局 ──
  const declaredState: Record<string, unknown> = {
    cupSize: input.cupSize,
    drinkType: input.drinkType,
    price,
  };
  // GLOBAL_CONFIG 不动

  const out2: GlobalStateOutput = {
    cupSize: input.cupSize,
    drinkType: input.drinkType,
    price,
    declaredState,
    pollutedGlobalConfig: false,
    pollutedKey: null,
    pollutedValue: null,
    globalConfigSnapshot: Object.fromEntries(GLOBAL_CONFIG),
    note: "状态写在 declared state 里；下次跑不会读到上次的 cupSize —— 全局不被污染。",
  };

  logger.info(
    "│ 调用函数-runStateInDeclaredState",
    "调用函数结束：runStateInDeclaredState",
    "为什么写这条日志：左栏不写 GLOBAL_CONFIG；返回 declared state 让前端对照右栏。",
    {
      返回值: out2,
      耗时ms: Date.now() - t0,
    },
  );
  return out2;
}

// ── 右栏：把状态写进 mock 全局（反例）──

export function runStatePollutedToGlobal(input: GlobalStateInput): GlobalStateOutput {
  logger.info(
    "│ 调用函数-runStatePollutedToGlobal",
    "调用函数开始：runStatePollutedToGlobal",
    "为什么写这条日志：右栏主流程 —— 把 cupSize + 假「密钥」写进 GLOBAL_CONFIG（模拟「写进 process.env」）。教学点：下次跑会读到上次的 cupSize（cross-run contamination）；配置类的密钥不该混进这一趟的状态。",
    {
      入参: input,
      __code: "const out = runStatePollutedToGlobal({ cupSize, drinkType });",
    },
  );
  const t0 = Date.now();

  const price = computePrice(input.cupSize, input.drinkType);
  // ── 关键：cupSize 写进 GLOBAL_CONFIG（反例）──
  GLOBAL_CONFIG.set("cup_size", input.cupSize);
  // 反例 2：把假「密钥」也写进 GLOBAL_CONFIG（密钥不该进这一趟）
  GLOBAL_CONFIG.set("secret_token", "fake-secret-" + Date.now());

  const declaredState: Record<string, unknown> = {
    cupSize: input.cupSize,
    drinkType: input.drinkType,
    price,
  };

  const pollutedKey = "cup_size";
  const pollutedValue = input.cupSize;

  const out2: GlobalStateOutput = {
    cupSize: input.cupSize,
    drinkType: input.drinkType,
    price,
    declaredState,
    pollutedGlobalConfig: true,
    pollutedKey,
    pollutedValue,
    globalConfigSnapshot: Object.fromEntries(GLOBAL_CONFIG),
    note: "状态写进了 GLOBAL_CONFIG（cup_size + secret_token）—— 下次跑会读到这次的 cupSize（cross-run contamination）。密钥也混进配置了 —— 配置类不该存这一趟的状态。",
  };

  logger.info(
    "│ 调用函数-runStatePollutedToGlobal",
    "调用函数结束：runStatePollutedToGlobal",
    "为什么写这条日志：右栏把 cupSize 写进 GLOBAL_CONFIG；返回 globalConfigSnapshot 让学习者看见「污染后的全局状态」。",
    {
      返回值: out2,
      耗时ms: Date.now() - t0,
    },
  );
  return out2;
}

// ── 调试用 · 重置 GLOBAL_CONFIG ──

export function resetGlobalConfig(): void {
  GLOBAL_CONFIG.clear();
}