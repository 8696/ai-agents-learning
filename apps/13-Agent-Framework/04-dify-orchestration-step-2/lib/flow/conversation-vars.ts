/**
 * 本步核心（左栏）：模拟编排产品里的「会话变量（Session Variable）」面板 —— 跨轮字段归产品替你存。
 *
 * 职责：跑两轮对话；每一轮用正则从用户原话抽 cupSize（大杯 / 中杯 / 小杯）和 drinkType（热 / 冰），
 *       写进 sessionVars；返回两轮对话记录 + 最终的会话变量面板。
 *
 * 数据流：{ text1, text2 } → 两轮 mock 解析 → sessionVars 累计 → { turns, sessionVars }。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；这是和右栏「你自己 state」对照的核心 —— 同一段跨轮字段，**一个在产品服务器里** vs **一个在你 TypeScript 类型里**。
 * 这一栏**不调大模型**（§5.3.0 例外「纯协议形状 / UI 渲染层演示」）：脚本 mock 两轮对话剧本，目的是对照"会话变量是谁替你存"，不是真的去跑一个产品。
 */
import { logger } from "../logger.js";

// ── 类型 ──

export type CupSize = "大杯" | "中杯" | "小杯";
export type DrinkType = "热" | "冰";

export type SessionVars = {
  /** 产品里的会话变量（Conversation Variable）—— 跨轮活着，归产品服务器 */
  cupSize?: CupSize;
  /** 同上，归产品服务器 */
  drinkType?: DrinkType;
  /** 这一栏记录两轮里某轮抽到了什么，方便前端展示对照 */
  lastUpdateRound?: 1 | 2;
};

export type TurnRecord = {
  /** 第几轮（1 = 用户第一句；2 = 第二句） */
  round: 1 | 2;
  /** 用户原话 */
  text: string;
  /** 助手回复（mock 函数产出） */
  reply: string;
  /** 这一轮解析出来的字段（部分抽到就是 partial） */
  parsed: { cupSize?: CupSize; drinkType?: DrinkType };
  /** 这一轮**之后**的 sessionVars 状态 */
  varsAfter: SessionVars;
};

export type ConversationVarsInput = {
  /** 第一轮用户原话 */
  text1: string;
  /** 第二轮用户原话 */
  text2: string;
};

export type ConversationVarsOutput = {
  /** 产品里的会话变量面板（每轮后更新） */
  sessionVars: SessionVars;
  /** 两轮对话记录 */
  turns: [TurnRecord, TurnRecord];
};

// ── Mock 解析（mock 模型从用户原话抽字段）──

function parseUserText(text: string): { cupSize?: CupSize; drinkType?: DrinkType } {
  const out: { cupSize?: CupSize; drinkType?: DrinkType } = {};
  if (/大杯/.test(text)) out.cupSize = "大杯";
  else if (/中杯/.test(text)) out.cupSize = "中杯";
  else if (/小杯/.test(text)) out.cupSize = "小杯";
  if (/热/.test(text)) out.drinkType = "热";
  else if (/冰/.test(text)) out.drinkType = "冰";
  return out;
}

function composeReply(parsed: { cupSize?: CupSize; drinkType?: DrinkType }, prevVars: SessionVars): string {
  const cp = parsed.cupSize ?? prevVars.cupSize;
  const dt = parsed.drinkType ?? prevVars.drinkType;
  if (!cp || !dt) return "（没抽到 cupSize / drinkType，原话不完整）";
  if (prevVars.cupSize && !parsed.cupSize) {
    return `好的，杯型还是 ${prevVars.cupSize}（从会话变量读到的），改成 ${dt} 饮品。`;
  }
  if (prevVars.cupSize && parsed.cupSize && prevVars.cupSize !== parsed.cupSize) {
    return `好的，杯型从 ${prevVars.cupSize} 改成 ${parsed.cupSize}，饮品 ${dt}。`;
  }
  return `好的，${cp} ${dt} 饮品已记下。`;
}

// ── 主流程 ──

/**
 * 跑两轮对话，维护一个跨轮活着的 sessionVars 面板。
 */
export function runConversationVars(input: ConversationVarsInput): ConversationVarsOutput {
  logger.info(
    "│ 调用函数-runConversationVars",
    "调用函数开始：runConversationVars",
    "为什么写这条日志：本步核心（左栏）—— 模拟产品里的「会话变量」面板，跨轮字段归产品替你存。两轮对话结束后返回 sessionVars（cupSize / drinkType）和两轮记录，让前端对照右栏的 state。",
    {
      入参: input,
      __code: "const out = runConversationVars({ text1, text2 });",
    },
  );
  const t0 = Date.now();

  // ── 第一轮 ──
  const parsed1 = parseUserText(input.text1);
  const sessionVars: SessionVars = { ...parsed1, lastUpdateRound: 1 };
  const reply1 = composeReply(parsed1, {});
  const turn1: TurnRecord = {
    round: 1,
    text: input.text1,
    reply: reply1,
    parsed: parsed1,
    varsAfter: { ...sessionVars },
  };

  // ── 第二轮 ──
  const parsed2 = parseUserText(input.text2);
  // 产品里的会话变量：这一轮解析出来的字段覆盖上一轮；没解析到的字段**保留**（归产品替你存）
  if (parsed2.cupSize || parsed2.drinkType) {
    if (parsed2.cupSize) sessionVars.cupSize = parsed2.cupSize;
    if (parsed2.drinkType) sessionVars.drinkType = parsed2.drinkType;
    sessionVars.lastUpdateRound = 2;
  }
  const reply2 = composeReply(parsed2, turn1.varsAfter);
  const turn2: TurnRecord = {
    round: 2,
    text: input.text2,
    reply: reply2,
    parsed: parsed2,
    varsAfter: { ...sessionVars },
  };

  const out: ConversationVarsOutput = { sessionVars, turns: [turn1, turn2] };

  logger.info(
    "│ 调用函数-runConversationVars",
    "调用函数结束：runConversationVars",
    "为什么写这条日志：第二轮结束后 sessionVars 是产品里活的字段（重启产品可能丢）；前端把两轮记录 + sessionVars 摊在面板里，方便对照右栏的 state.cupSize。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}