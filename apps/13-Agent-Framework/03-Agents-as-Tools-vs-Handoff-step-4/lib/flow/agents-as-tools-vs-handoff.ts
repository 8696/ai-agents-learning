/**
 * 本步核心：模拟「进线第一句就分流」——左栏从第一句起就是退款专员接（没有总客服调用专员再自己说）；右栏走普通 handoff（第一句总客服接，第二句总客服移交给专员）。
 *
 * 职责：给定一个 mode（entry-routing / handoff）、当前 Agent（refund / host）、已发了几条用户消息（step 计数），
 *       返回这一次「用户说了下一句」之后要追加到消息列表的若干条消息 + 新的当前 Agent + 下一句判据。
 *
 * 数据流：mode + currentAgent + step → 固定循环的话术 → newMessages / nextCurrentAgent / rationale。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；学习者复习时打开这一个文件能把「进线分流 vs 中途分流」的差异看完。
 *
 * 注：本 demo 不调大模型，话术循环硬编码。真接 SDK 留到模块 14。
 */
import { logger } from "../logger.js";

// ── 角色定义 ──

export type AgentRole = "host" | "refund" | "guide";

export type AgentMessage = {
  from: AgentRole | "user";
  text: string;
  kind?: "speech" | "tool-call" | "tool-result" | "system";
};

export type Scenario = {
  scenarioId: string;
  userMessage: string;
  orderId: string;
  rationaleEntryRouting: string;
  rationaleHandoff: string;
  entryRoutingSource: string;
  handoffSource: string;
  commonSource: string;
};

export type SendNextInput = {
  mode: "entry-routing" | "handoff";
  currentAgent: AgentRole;
  userTurnCount: number;
};

export type SendNextOutput = {
  appended: AgentMessage[];
  nextCurrentAgent: AgentRole;
  rationale: string;
};

// ── 固定场景 ──

export const FIXED_SCENARIO: Scenario = {
  scenarioId: "A10086-entry-routing",
  userMessage: "上周买的耳机右耳没声音，想退款。订单号 A10086。",
  orderId: "A10086",
  // 进线分流：第一句接的是退款专员
  rationaleEntryRouting:
    "从第一句起就是退款专员 = 进线分流。入口就定当前 Agent；会话里没有「总客服调用专员再自己说」。下一句仍由专员接（专员仍是当前 Agent）。",
  // 中途分流：先 host，host 移交
  rationaleHandoff:
    "下一句换成退款专员 = 任务移交。分诊不在等返回值；专员的消息列表从这一句开始累。",
  entryRoutingSource:
    "// 进线分流 — 入口直接定当前 Agent\n" +
    "function handleEntry(intent) {\n" +
    "  if (intent === \"refund\") {\n" +
    "    activeAgent = refundAgent;        // ← 从第一句起当前 Agent 就是专员\n" +
    "    history.push({ from: refund, kind: system, text: 进线分流：退款专员 });\n" +
    "    history.push({ from: refund, kind: speech, text: 我是退款专员。这单可以退，请确认退货地址。 });\n" +
    "    return;\n" +
    "  }\n" +
    "  // 其他入口...\n" +
    "}\n" +
    "// 关键：从一开始就没有 host 在等专员返回值这一步",
  handoffSource:
    "// 中途分流 — 总客服先接，第一圈后才移交\n" +
    "// 这条线对照的是「中间多了一道 host 在等返回值」\n" +
    "activeAgent = hostAgent;\n" +
    "if (hostAgent.needsRefundSpecialist(intent)) {\n" +
    "  activeAgent = refundAgent;\n" +
    "  history.push({ from: host, kind: speech, text: 我把您转到退款专员。 });\n" +
    "  history.push({ from: refund, kind: system, text: 已接手，前情见上 });\n" +
    "  history.push({ from: refund, kind: speech, text: 我是退款专员。这单可以退，请确认退货地址。 });\n" +
    "}\n" +
    "// 关键：第一句用户看到的是 host 的处理（哪怕是「我把您转到...」），不是专员直接开口",
  commonSource:
    "// 共同的「下一句谁接」判据\n" +
    "if (activeAgent === host) {\n" +
    "  // host 接\n" +
    "} else if (activeAgent === refund) {\n" +
    "  // 专员接\n" +
    "}\n" +
    "// 入口分流 vs 中途分流，差别是「第一句回复者是谁」：\n" +
    "//   - 入口分流：第一句是专员（专员从一开始就是当前 Agent）\n" +
    "//   - 中途分流：第一句是 host，第二句才切到专员",
};

// ── 话术循环 ──

const HOST_HANDOFF_TURNS = [
  "我把您转到退款专员。",
];
const REFUND_TURNS = [
  "我是退款专员。这单可以退，请确认退货地址。",
  "好的，专员收到地址后会再确认一次收件时间。",
  "退款审核一般是工作日 24 小时内完成。",
  "我已经把退货登记好了。",
  "好。",
];

// ── 主流程 ──

export function sendNext(input: SendNextInput): SendNextOutput {
  const { mode, currentAgent: _currentAgent, userTurnCount } = input;
  logger.info(
    "│ 调用函数-sendNext",
    "调用函数开始：sendNext",
    "为什么写这条日志：route 只认这一层的返回值；返回里讲清这一次追加什么 + 下一句进谁。当前：刚收到前端「发送下一句」请求，按 mode 决定进线分流 vs 中途分流。",
    {
      入参: input,
      __code: "const out = sendNext({ mode, currentAgent, userTurnCount });",
    },
  );
  const t0 = Date.now();

  let appended: AgentMessage[];
  let nextCurrentAgent: AgentRole;
  let rationale: string;

  if (mode === "entry-routing") {
    // 进线分流：从第一句起就是专员接；nextCurrentAgent 永远 = refund
    if (userTurnCount === 0) {
      appended = [
        { from: "refund", kind: "system", text: "（进线分流：退款专员；前情为空）" },
        { from: "refund", kind: "speech", text: REFUND_TURNS[0] },
      ];
    } else {
      const idx = Math.min(userTurnCount, REFUND_TURNS.length - 1);
      appended = [
        { from: "refund", kind: "speech", text: REFUND_TURNS[idx] },
      ];
    }
    nextCurrentAgent = "refund"; // 一直是专员
    rationale = FIXED_SCENARIO.rationaleEntryRouting;
  } else {
    // handoff 模式（保留 step-1 / step-3 行为）：第一次 host → refund
    if (userTurnCount === 0) {
      appended = [
        { from: "host", kind: "speech", text: HOST_HANDOFF_TURNS[0] },
        { from: "refund", kind: "system", text: "（退款专员成为当前 Agent；前情见上）" },
        { from: "refund", kind: "speech", text: REFUND_TURNS[0] },
      ];
      nextCurrentAgent = "refund";
      rationale = FIXED_SCENARIO.rationaleHandoff;
    } else {
      const idx = Math.min(userTurnCount, REFUND_TURNS.length - 1);
      appended = [
        { from: "refund", kind: "speech", text: REFUND_TURNS[idx] },
      ];
      nextCurrentAgent = "refund";
      rationale = FIXED_SCENARIO.rationaleHandoff;
    }
  }

  logger.info(
    "│ 调用函数-sendNext",
    "调用函数结束：sendNext",
    "为什么写这条日志：前端拿到这个结果会立刻刷新「当前 Agent」徽标 + 追加消息 + 改下一句判据。当前：已经按 mode 算完 appended + nextCurrentAgent + rationale。",
    {
      返回值: { appended, nextCurrentAgent, rationale },
      耗时ms: Date.now() - t0,
    },
  );
  return { appended, nextCurrentAgent, rationale };
}