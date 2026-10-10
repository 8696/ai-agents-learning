/**
 * 本步核心：模拟「同一轮调多个专员（并行的当工具调用）」——左栏一次调一个，右栏同一轮调两个并行。
 *
 * 职责：给定一个 mode（tool / tool-multi / handoff）、当前 Agent（host / refund / guide）、已发了几条用户消息（step 计数），
 *       返回这一次「用户说了下一句」之后要追加到消息列表的若干条消息 + 新的当前 Agent + 下一句判据。
 *
 * 数据流：mode + currentAgent + step → 固定循环的话术 → newMessages / nextCurrentAgent / rationale。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；学习者复习时打开这一个文件能把「同一轮多个 tool_call 并行」的差异看完。
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
  rationaleTool: string;
  rationaleToolMulti: string;
  rationaleHandoff: string;
  toolSource: string;
  toolMultiSource: string;
  handoffSource: string;
  commonSource: string;
};

export type SendNextInput = {
  mode: "tool" | "tool-multi" | "handoff";
  currentAgent: AgentRole;
  userTurnCount: number;
};

export type SendNextOutput = {
  appended: AgentMessage[];
  nextCurrentAgent: AgentRole;
  rationale: string;
};

// ── 固定场景（贯穿一条线） ──

export const FIXED_SCENARIO: Scenario = {
  scenarioId: "A10086-availability",
  userMessage: "耳机 A10086 现在还有货吗？几天能到？",
  orderId: "A10086",
  // 单 tool_call
  rationaleTool:
    "下一句还进总客服 = 当工具调用（单 tool_call）。只调一个专员，专结论进总客服消息列表里的 tool_result；下一句仍由总客服接。",
  // 同一轮多 tool_call（并行）
  rationaleToolMulti:
    "下一句还进总客服 = 当工具调用（多 tool_call 并行）。同一轮调多个专员，所有专结论都进总客服消息列表里的 tool_result；下一句仍由总客服接。",
  // 任务移交
  rationaleHandoff:
    "下一句换成专员 = 任务移交。分诊不在等返回值；专员的消息列表从这一句开始累。",
  toolSource:
    "// 当工具调用（单 tool_call）\n" +
    "const advice = await stockAgent.run({ orderId });\n" +
    "history.push({ from: host, kind: tool-call, name: askStockAgent, args });\n" +
    "history.push({ from: tool,  kind: tool-result, value: advice });   // ← 一个专员的结论进这里\n" +
    "history.push({ from: host, kind: speech, text: speakAsHost(advice) });\n" +
    "// 下一句仍由 host 接",
  toolMultiSource:
    "// 当工具调用（同一轮多 tool_call 并行）\n" +
    "// 关键差异：一个超步里并行跑多个工具；专结论都进同一份 host 消息列表\n" +
    "const [stockAdvice, logisticsAdvice] = await Promise.all([\n" +
    "  stockAgent.run({ orderId }),\n" +
    "  logisticsAgent.run({ orderId }),\n" +
    "]);\n" +
    "history.push({ from: host, kind: tool-call,   name: askStockAgent, args });\n" +
    "history.push({ from: host, kind: tool-call,   name: askLogisticsAgent, args });\n" +
    "history.push({ from: tool,  kind: tool-result, value: stockAdvice });     // ← 专员的结论进这里\n" +
    "history.push({ from: tool,  kind: tool-result, value: logisticsAdvice });  // ← 另一个专员的结论进这里\n" +
    "history.push({ from: host, kind: speech, text: summarizeAsHost([stockAdvice, logisticsAdvice]) });\n" +
    "// 下一句仍由 host 接",
  handoffSource:
    "// 任务移交 — 改的是当前 Agent\n" +
    "if (userAsksForRefundSpecialist(intent)) {\n" +
    "  activeAgent = refundAgent;\n" +
    "  history.push({ from: host, kind: speech, text: 我把您转到退款专员。 });\n" +
    "  history.push({ from: refund, kind: system, text: 已接手 });\n" +
    "  history.push({ from: refund, kind: speech, text: ... });\n" +
    "}",
  commonSource:
    "// 不论一次调一个还是调多个，下一句都仍由 host 接\n" +
    "// 任务移交每发生一次，activeAgent 就换一次；当工具调用永远不换\n" +
    "if (activeAgent === host) {\n" +
    "  // host 接\n" +
    "} else {\n" +
    "  // 已被换走的 Agent 接\n" +
    "}",
};

// ── 话术循环（写死 5 条；够看几次切换） ──

// 单 tool_call 模式下 host 汇总一句话（按 userTurnCount 取第几条）
const HOST_SINGLE_TOOL_RESPONSES = [
  "我查一下库存专员。",
  "好的，专员已经查到。",
  "专员确认还有货。",
  "我让物流专员再加急。",
  "好的，下单后会再次确认。",
];

// tool-multi 模式下 host 汇总一句话（按 userTurnCount 取第几条）
const HOST_MULTI_TOOL_RESPONSES = [
  "我同时问库存和物流专员。",
  "两位专员都回了：当前有货、3 天内可送达。",
  "我让专员再加急一下。",
  "好的，已经下单。",
  "好。",
];

// tool-multi 模式下两个专员的 tool-result（按 userTurnCount 取第几条）
const STOCK_RESULTS = [
  "耳机 A10086 当前有货，库存 32 件。",
  "耳机 A10086 库存 28 件。",
  "耳机 A10086 库存 25 件。",
  "耳机 A10086 库存 22 件。",
  "耳机 A10086 库存 20 件。",
];
const LOGISTICS_RESULTS = [
  "上海仓发出，预计 3 天内送达。",
  "顺丰特快，预计 2 天送达。",
  "顺丰特快，预计 2 天送达。",
  "EMS，预计 5 天送达。",
  "EMS，预计 5 天送达。",
];

// handoff 模式（保留 step-1 行为）
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
    "为什么写这条日志：route 只认这一层的返回值；返回里讲清这一次追加什么 + 下一句进谁。当前：刚收到前端「发送下一句」请求，按 mode 决定单 tool_call / 多 tool_call 并行 / handoff。",
    {
      入参: input,
      __code: "const out = sendNext({ mode, currentAgent, userTurnCount });",
    },
  );
  const t0 = Date.now();

  let appended: AgentMessage[];
  let nextCurrentAgent: AgentRole;
  let rationale: string;

  if (mode === "tool") {
    // 当工具调用（单 tool_call）：currentAgent 不变；调一个专员
    const idx = Math.min(userTurnCount, HOST_SINGLE_TOOL_RESPONSES.length - 1);
    const speech = HOST_SINGLE_TOOL_RESPONSES[idx];
    appended = [
        { from: "host", kind: "tool-call", text: "调 askStockAgent（A10086）" },
        { from: "host", kind: "tool-result", text: "库存专员结论：" + STOCK_RESULTS[Math.min(userTurnCount, STOCK_RESULTS.length - 1)] },
        { from: "host", kind: "speech", text: speech },
      ];
    nextCurrentAgent = "host"; // 不换
    rationale = FIXED_SCENARIO.rationaleTool;
  } else if (mode === "tool-multi") {
    // 当工具调用（同一轮多 tool_call 并行）：currentAgent 不变；同一轮调两个专员
    const idx = Math.min(userTurnCount, HOST_MULTI_TOOL_RESPONSES.length - 1);
    const speech = HOST_MULTI_TOOL_RESPONSES[idx];
    appended = [
        // 两个工具调用同时发出（同一轮）
        { from: "host", kind: "tool-call", text: "调 askStockAgent（A10086）" },
        { from: "host", kind: "tool-call", text: "调 askLogisticsAgent（A10086）" },
        // 两个工具返回值都放进 host 的消息列表
        { from: "host", kind: "tool-result", text: "库存专员结论：" + STOCK_RESULTS[Math.min(userTurnCount, STOCK_RESULTS.length - 1)] },
        { from: "host", kind: "tool-result", text: "物流专员结论：" + LOGISTICS_RESULTS[Math.min(userTurnCount, LOGISTICS_RESULTS.length - 1)] },
        // host 汇总成一句对用户说
        { from: "host", kind: "speech", text: speech },
      ];
    nextCurrentAgent = "host"; // 不换
    rationale = FIXED_SCENARIO.rationaleToolMulti;
  } else {
    // handoff 模式（保留 step-1 行为）
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