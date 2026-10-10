/**
 * 本步核心：模拟「当工具调用 vs 任务移交」两种模式下，两个 Agent 的对话流转。
 *
 * 职责：给定一个 mode（tool / handoff）、当前 Agent（host / refund）、已发了几条用户消息（step 计数），
 *       返回这一次「用户说了下一句」之后要追加到消息列表的若干条消息 + 新的当前 Agent + 下一句判据。
 *
 * 数据流：mode + currentAgent + step → 固定循环的话术 → newMessages / nextCurrentAgent / rationale。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；学习者复习时打开这一个文件能把「当工具调用 vs 任务移交」的差异看完。
 *
 * 注：本 demo 不调大模型，话术循环硬编码（5 条循环足够看几次切换）。真接 SDK（OpenAI Agents SDK 的
 *   `as_tool` / `handoffs` / `last_agent`、LangChain 的 agents as tools）留到模块 14。
 */
import { logger } from "../logger.js";

// ── 角色定义 ──

export type AgentRole = "host" | "refund";

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
  rationaleHandoff: string;
  toolSource: string;
  handoffSource: string;
  commonSource: string;
};

export type SendNextInput = {
  mode: "tool" | "handoff";
  currentAgent: AgentRole;
  /** 已发了几次用户消息（0 = 用户还没说第一句；1 = 已发第一句；...） */
  userTurnCount: number;
};

export type SendNextOutput = {
  appended: AgentMessage[];
  nextCurrentAgent: AgentRole;
  rationale: string;
};

// ── 固定场景（贯穿一条线） ──

export const FIXED_SCENARIO: Scenario = {
  scenarioId: "A10086-refund",
  userMessage: "上周买的耳机右耳没声音，想退款。订单号 A10086。",
  orderId: "A10086",
  // 当工具调用模式：调用方还在，子 Agent 只交回结论；下一句还进调用方
  rationaleTool:
    "下一句还进总客服 = 当工具调用。专员没接用户的下一句；专员的话塞进总客服消息列表里的 tool_result。",
  // 任务移交模式：原 Agent 停在这里；新 Agent 直接对用户说；下一句进新人
  rationaleHandoff:
    "下一句换成退款专员 = 任务移交。分诊不在等返回值；专员的消息列表从这一句开始累。",
  toolSource:
    "// 当工具调用 — 子 Agent 当工具，原 Agent 等返回值\n" +
    "const advice = await refundAgent.run({ orderId, issue });\n" +
    "history.push({ from: host, kind: tool-call, name: askRefundAgent, args });\n" +
    "history.push({ from: tool,  kind: tool-result, value: advice });   // ← 专员的话进这里\n" +
    "history.push({ from: host, kind: speech, text: speakAsHost(advice) });\n" +
    "// 下一句仍由 host 接（callSite 还在）",
  handoffSource:
    "// 任务移交 — 改的是当前 Agent，原 Agent 不等返回值\n" +
    "if (needsRefundSpecialist(intent)) {\n" +
    "  activeAgent = refundAgent;\n" +
    "  history.push({ from: host, kind: speech, text: 我把您转到退款专员。 });\n" +
    "  history.push({ from: refund, kind: system, text: 已接手，前情见上 } );\n" +
    "  history.push({ from: refund, kind: speech, text: 我是退款专员。这单可以退，请确认退货地址。 });\n" +
    "}\n" +
    "// 下一句进 refund（activeAgent 已换）",
  commonSource:
    "// 双方共同的「下一句进谁」判据\n" +
    "if (activeAgent === host) {\n" +
    "  // 还在 host → 由 host 接\n" +
    "} else {\n" +
    "  // 已经交出去 → 由新 Agent 接\n" +
    "}\n" +
    "// 模式决定的是「什么时候 activeAgent 会变」：tool 模式基本不变；handoff 模式一旦交出去就换。",
};

// ── 话术循环（写死 5 条；够看几次切换） ──

const HOST_TOOL_RESPONSES = [
  "可以退。这单 7 天内、质量问题可全额退。请确认退货地址，我让专员给你出退货单。",
  "好的，专员收到地址后会再确认一次收件时间。整个退款大约 3 个工作日。",
  "退款审核一般是工作日 24 小时内完成；通过后会原路返回您的支付账户。",
  "专员已经登记。您可以在「我的订单」-「售后」里随时查看进度。",
  "好。我把这一单的处理权继续留在专员这里，您有物流的问题也可以直接问她。",
];

const HOST_HANDOFF_TURNS = [
  // step 0 的 host 一次：表示移交
  "我把您转到退款专员。",
];
const REFUND_TURNS = [
  "我是退款专员。这单可以退，请确认退货地址。",
  "好的，专员收到地址后会再确认一次收件时间。整个退款大约 3 个工作日。",
  "退款审核一般是工作日 24 小时内完成；通过后会原路返回您的支付账户。",
  "我已经把退货登记好了。您可以在「我的订单」-「售后」里随时查看进度。",
  "后续如果还有问题，您继续在这里说，我接着处理。",
];

// ── 主流程 ──

/**
 * 推进一次「用户说了下一句」。返回要追加的若干条消息 + 新的当前 Agent + 下一句判据。
 *
 * @param input.mode            tool = 当工具调用；handoff = 任务移交
 * @param input.currentAgent    调用方当前是哪一位（host / refund）
 * @param input.userTurnCount   已发了几次用户消息（首次发 = 0；post 后会 +1）
 */
export function sendNext(input: SendNextInput): SendNextOutput {
  const { mode, currentAgent: _currentAgent, userTurnCount } = input;
  logger.info(
    "│ 调用函数-sendNext",
    "调用函数开始：sendNext",
    "为什么写这条日志：route 只认这一层的返回值；返回里讲清这一次追加什么 + 下一句进谁。当前：刚收到前端「发送下一句」请求，要按 mode 决定要不要换 activeAgent。",
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
    // 当工具调用：currentAgent 永远不换；总客服收到「工具调用 + 工具返回值 + 总客服的话」
    const idx = Math.min(userTurnCount, HOST_TOOL_RESPONSES.length - 1);
    const speech = HOST_TOOL_RESPONSES[idx];
    appended = [
      // 模拟一次工具调用 + 工具返回值
        { from: "host", kind: "tool-call", text: "调 askRefundAgent（A10086, 右耳无声音）" },
        { from: "host", kind: "tool-result", text: "专员结论：7 天内、质量问题可全额退，需用户确认退货地址" },
        { from: "host", kind: "speech", text: speech },
      ];
    nextCurrentAgent = "host"; // 不换
    rationale = FIXED_SCENARIO.rationaleTool;
  } else {
    // 任务移交：
    //   - step == 0：原 Agent 停在这里 + 移交流 + 当前 Agent 切换到 refund + refund 接话
    //   - step >= 1：当前 Agent 已是 refund；refund 继续接话
    if (userTurnCount === 0) {
      appended = [
        { from: "host", kind: "speech", text: HOST_HANDOFF_TURNS[0] }, // 「我把您转到退款专员。」
        { from: "refund", kind: "system", text: "（退款专员成为当前 Agent；前情见上）" },
        { from: "refund", kind: "speech", text: REFUND_TURNS[0] },
      ];
      nextCurrentAgent = "refund"; // 切换
    } else {
      const idx = Math.min(userTurnCount, REFUND_TURNS.length - 1);
      appended = [
        { from: "refund", kind: "speech", text: REFUND_TURNS[idx] },
      ];
      nextCurrentAgent = "refund";
    }
    rationale = FIXED_SCENARIO.rationaleHandoff;
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