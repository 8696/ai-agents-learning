/**
 * 本步核心（右栏）：模拟「你自己的 state」—— 跨轮字段归你 TypeScript 类型持有，在仓库里 commit 就在。
 *
 * 职责：跑两轮对话；每一轮用正则从用户原话抽 cupSize / drinkType，
 *       写进 state（对照模块 11 的状态类型）；返回两轮对话记录 + 最终的 state。
 *
 * 数据流：{ text1, text2 } → 两轮 mock 解析 → state 累计 → { turns, state }。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；这是和左栏「会话变量」对照的核心 —— 同一段跨轮字段，**一个在产品服务器里** vs **一个在你 TypeScript 类型里**。
 * 这一栏**不调大模型**（§5.3.0 例外「纯协议形状 / UI 渲染层演示」）：脚本 mock 两轮对话剧本，目的是对照"你的 state 在仓库里"，不是真的去跑一段状态机。
 */
import { logger } from "../logger.js";

// ── 类型 ──

export type CupSize = "大杯" | "中杯" | "小杯";
export type DrinkType = "热" | "冰";

/** 你的 TypeScript state 类型（对照模块 11 状态机；这一小节只演示 cupSize / drinkType 两个字段） */
export type OrderState = {
  /** 模块 11 风格的 currentNode（这一栏不重要，留个名） */
  currentNode: "start" | "drink-confirmed";
  /** 用户原话（这一轮的） */
  userText: string;
  /** 你 state 里 declared 的 cupSize —— 在仓库里，commit 进 git 就在 */
  cupSize: CupSize | null;
  /** 你 state 里 declared 的 drinkType —— 在仓库里 */
  drinkType: DrinkType | null;
};

export type TurnRecord = {
  round: 1 | 2;
  text: string;
  reply: string;
  parsed: { cupSize?: CupSize; drinkType?: DrinkType };
  stateAfter: OrderState;
};

export type YourStateInput = {
  text1: string;
  text2: string;
};

export type YourStateOutput = {
  /** 你仓库里的 state（已 declared 的 TypeScript 类型） */
  state: OrderState;
  /** 两轮对话记录 */
  turns: [TurnRecord, TurnRecord];
};

// ── Mock 解析（同左栏，保持对照一致）──

function parseUserText(text: string): { cupSize?: CupSize; drinkType?: DrinkType } {
  const out: { cupSize?: CupSize; drinkType?: DrinkType } = {};
  if (/大杯/.test(text)) out.cupSize = "大杯";
  else if (/中杯/.test(text)) out.cupSize = "中杯";
  else if (/小杯/.test(text)) out.cupSize = "小杯";
  if (/热/.test(text)) out.drinkType = "热";
  else if (/冰/.test(text)) out.drinkType = "冰";
  return out;
}

function composeReply(parsed: { cupSize?: CupSize; drinkType?: DrinkType }, prev: OrderState): string {
  const cp = parsed.cupSize ?? prev.cupSize;
  const dt = parsed.drinkType ?? prev.drinkType;
  if (!cp || !dt) return "（没抽到 cupSize / drinkType，原话不完整）";
  if (prev.cupSize && !parsed.cupSize) {
    return `好的，杯型还是 ${prev.cupSize}（从 state 读到的），改成 ${dt} 饮品。`;
  }
  if (prev.cupSize && parsed.cupSize && prev.cupSize !== parsed.cupSize) {
    return `好的，杯型从 ${prev.cupSize} 改成 ${parsed.cupSize}，饮品 ${dt}。`;
  }
  return `好的，${cp} ${dt} 饮品已记下。`;
}

// ── 主流程 ──

/**
 * 跑两轮对话，维护一个 declared 的 TypeScript state 类型 —— 字段在你仓库里。
 */
export function runYourState(input: YourStateInput): YourStateOutput {
  logger.info(
    "│ 调用函数-runYourState",
    "调用函数开始：runYourState",
    "为什么写这条日志：本步核心（右栏）—— 模拟「你自己的 state」（对照模块 11 OrderState）；跨轮字段在你仓库里，commit 进 git 就在。两轮对话结束后返回 state + 两轮记录，让前端对照左栏的 sessionVars。",
    {
      入参: input,
      __code: "const out = runYourState({ text1, text2 });",
    },
  );
  const t0 = Date.now();

  // ── 第一轮 ──
  const parsed1 = parseUserText(input.text1);
  const state: OrderState = {
    currentNode: "drink-confirmed",
    userText: input.text1,
    cupSize: parsed1.cupSize ?? null,
    drinkType: parsed1.drinkType ?? null,
  };
  const reply1 = composeReply(parsed1, { ...state, cupSize: null, drinkType: null });
  const turn1: TurnRecord = {
    round: 1,
    text: input.text1,
    reply: reply1,
    parsed: parsed1,
    stateAfter: { ...state },
  };

  // ── 第二轮 ──
  const parsed2 = parseUserText(input.text2);
  // 你的 state：每一轮覆盖（assign new）；没解析到的字段**保留**上一轮的值
  if (parsed2.cupSize || parsed2.drinkType) {
    if (parsed2.cupSize) state.cupSize = parsed2.cupSize;
    if (parsed2.drinkType) state.drinkType = parsed2.drinkType;
    state.userText = input.text2;
  }
  const reply2 = composeReply(parsed2, turn1.stateAfter);
  const turn2: TurnRecord = {
    round: 2,
    text: input.text2,
    reply: reply2,
    parsed: parsed2,
    stateAfter: { ...state },
  };

  const out: YourStateOutput = { state, turns: [turn1, turn2] };

  logger.info(
    "│ 调用函数-runYourState",
    "调用函数结束：runYourState",
    "为什么写这条日志：第二轮结束后 state 是你仓库里 declared 的字段（commit 进 git 就在）；前端把两轮记录 + state 摊在面板里，方便对照左栏的 sessionVars.cupSize。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}