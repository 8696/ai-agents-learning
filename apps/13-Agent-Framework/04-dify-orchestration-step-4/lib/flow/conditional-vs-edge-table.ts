/**
 * 本步核心：模拟「条件分支」vs「边表核对」—— 同一段选边（按 intent），但前者不拦非法转移，后者按 declared 边表拒绝。
 * 不调大模型（§5.3.0 例外「纯协议形状 / UI 演示」）：脚本 mock 三个 case；目的是对照「脑补产品会拦 = 错」—— 拦截按你画的 / 你 declared 的为准。
 *
 * 职责：
 *   - runConditionalBranch(input)：手写条件分支 —— 按 intent 选边，**不拦非法转移**
 *   - runEdgeTableCheck(input)：手写边表核对 —— 同一段选边后，按 declared 边表（对照模块 11 状态机的 edgeTable）拒绝不在名单的下一站
 *
 * 数据流：{ intent, paymentStatus } → chooseRouteByIntent → chosenRoute → 边表核对 → { chosenRoute / nextNode, allowed, reason }。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；这是和左栏「条件分支」对照的核心 —— 同一段选边，**拦不拦 = 你 declared 边表说了算，不是产品替你拦**。
 */
import { logger } from "../logger.js";

// ── 类型 ──

export type Intent = "热饮" | "冰饮" | "未付款想出品";
export type PaymentStatus = "已付款" | "未付款";

export type ScenarioInput = {
  intent: Intent;
  paymentStatus: PaymentStatus;
};

// ── 共享：条件分支自己写的选边逻辑（同一段，两栏都走）──

function chooseRouteByIntent(intent: Intent): string {
  if (intent === "热饮") return "热饮出品";
  if (intent === "冰饮") return "冰饮出品";
  return "未付款想出品";
}

// ── declared 边表（对照模块 11 状态机的 edgeTable）──
// 「已付款」允许走「热饮出品」/「冰饮出品」；「未付款」不允许任何出品。
const EDGE_TABLE: Record<PaymentStatus, string[]> = {
  "已付款": ["热饮出品", "冰饮出品"],
  "未付款": [],
};

function checkEdgeTable(paymentStatus: PaymentStatus, chosenRoute: string): boolean {
  return EDGE_TABLE[paymentStatus].includes(chosenRoute);
}

// ── 左栏主流程：条件分支 ──

export type ConditionalBranchOutput = {
  intent: Intent;
  paymentStatus: PaymentStatus;
  /** 条件分支选出来的下一站 */
  chosenRoute: string;
  /** 条件分支不拦非法转移，永远 true（这是和右栏对照的核心） */
  allowed: boolean;
  /** 一句话讲清为什么放行 / 不放 */
  reason: string;
  /** 出处标识 —— 教学：左栏是「条件分支（只按变量选边）」，不是「边表核对」 */
  source: string;
};

export function runConditionalBranch(input: ScenarioInput): ConditionalBranchOutput {
  logger.info(
    "│ 调用函数-runConditionalBranch",
    "调用函数开始：runConditionalBranch",
    "为什么写这条日志：左栏主流程 —— 手写条件分支只按 intent 选边，不拦非法转移。教学点：条件分支 ≠ 边表核对 —— 条件分支只认变量，\"未付款想出品\" 也会按 intent 选 \"未付款想出品\" 这一站走过去。",
    {
      入参: input,
      __code: "const out = runConditionalBranch({ intent, paymentStatus });",
    },
  );
  const t0 = Date.now();

  const chosenRoute = chooseRouteByIntent(input.intent);
  const allowed = true; // 条件分支不拦
  const reason = allowed
    ? "条件分支按 intent 选边，没核对 declared edgeTable。" + (input.paymentStatus === "未付款" ? "（注意：paymentStatus=未付款，条件分支仍放行——这就是产品画「未付款→出品」不拦的原因之一）" : "")
    : "（条件分支理论上不拦；放这里保持形状一致）";

  const out: ConditionalBranchOutput = {
    intent: input.intent,
    paymentStatus: input.paymentStatus,
    chosenRoute,
    allowed,
    reason,
    source: "条件分支（条件路由 · 只按 intent 选边）",
  };

  logger.info(
    "│ 调用函数-runConditionalBranch",
    "调用函数结束：runConditionalBranch",
    "为什么写这条日志：左栏无论 paymentStatus 是什么都放行（条件分支不拦非法转移）；返回 chosenRoute 让前端对照右栏 nextNode。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}

// ── 右栏主流程：边表核对 ──

export type EdgeTableCheckOutput = {
  intent: Intent;
  paymentStatus: PaymentStatus;
  chosenRoute: string;
  /** 边表核对后的下一站；不在边表里 = "拦截" */
  nextNode: string;
  /** 是否在 declared 边表里 */
  allowed: boolean;
  /** 一句话讲清为什么放行 / 不放 */
  reason: string;
  /** 出处标识 —— 教学：右栏是「边表核对（declared 边表 + 拒绝非法转移）」 */
  source: string;
  /** 整张 declared 边表（教学露出，方便学习者一眼看见名单） */
  edgeTable: Record<PaymentStatus, string[]>;
};

export function runEdgeTableCheck(input: ScenarioInput): EdgeTableCheckOutput {
  logger.info(
    "│ 调用函数-runEdgeTableCheck",
    "调用函数开始：runEdgeTableCheck",
    "为什么写这条日志：右栏主流程 —— 选边之后走 declared 边表核对（模块 11 状态机的 edgeTable）。教学点：拦截是 declared 的边表说了算；不在边表里 = 拒绝非法转移。",
    {
      入参: input,
      __code: "const out = runEdgeTableCheck({ intent, paymentStatus });",
    },
  );
  const t0 = Date.now();

  const chosenRoute = chooseRouteByIntent(input.intent);
  const allowed = checkEdgeTable(input.paymentStatus, chosenRoute);
  const nextNode = allowed ? chosenRoute : "拦截（不在 declared 边表里）";
  const reason = allowed
    ? `declared 边表里 (paymentStatus=${input.paymentStatus}, chosenRoute=${chosenRoute}) 在名单 → 放行。`
    : `declared 边表里 (paymentStatus=${input.paymentStatus}, chosenRoute=${chosenRoute}) **不在名单** → 拒绝非法转移。`;

  const out: EdgeTableCheckOutput = {
    intent: input.intent,
    paymentStatus: input.paymentStatus,
    chosenRoute,
    nextNode,
    allowed,
    reason,
    source: "边表核对（declared 边表 + 拒绝非法转移）",
    edgeTable: EDGE_TABLE,
  };

  logger.info(
    "│ 调用函数-runEdgeTableCheck",
    "调用函数结束：runEdgeTableCheck",
    "为什么写这条日志：右栏按 declared 边表决定 allowed；allowed=false 时 nextNode = \"拦截\"；前端对照左栏 chosenRoute 看见差异。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}