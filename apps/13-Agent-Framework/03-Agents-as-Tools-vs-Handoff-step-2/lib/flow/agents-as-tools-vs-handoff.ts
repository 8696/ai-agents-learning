/**
 * 本步核心：模拟「任务移交的链式扩展」——host → refund → guide，
gate-1（首次移交）+ gate-2（再交给下一个人）。
 *
 * 职责：给定一个 mode（tool / handoff）、当前 Agent（host / refund / guide）、已发了几条用户消息（step 计数），
 *       返回这一次「用户说了下一句」之后要追加到消息列表的若干条消息 + 新的当前 Agent + 下一句判据。
 *
 * 数据流：mode + currentAgent + step → 固定循环的话术 → newMessages / nextCurrentAgent / rationale。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；学习者复习时打开这一个文件能把「连续移交」的差异看完。
 *
 * 注：本 demo 不调大模型，话术循环硬编码（每 Agent 5 条循环）。真接 SDK 留到模块 14。
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
  userMessage2: string;
  orderId: string;
  rationaleTool: string;
  rationaleHandoffFirst: string;
  rationaleHandoffSecond: string;
  toolSource: string;
  handoffSource: string;
  handoffChainSource: string;
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
  scenarioId: "A10086-refund-then-guide",
  // 第 1 句：触发 host → refund 移交（首次移交）
  userMessage: "上周买的耳机右耳没声音，想退款。订单号 A10086。",
  // 第 2 句：触发 refund → guide 再移交一次
  userMessage2: "退完款顺便帮我推荐一款替代耳机，预算 1000 以内。",
  orderId: "A10086",
  // 当工具调用模式：调用方还在，子 Agent 只交回结论
  rationaleTool:
    "下一句还进总客服 = 当工具调用。专员没接用户的下一句；专员的话塞进总客服消息列表里的 tool_result。",
  // 任务移交 · 首次：原 Agent 停在这里；新 Agent 直接对用户说；下一句进新人
  rationaleHandoffFirst:
    "下一句换成退款专员 = 任务移交。分诊不在等返回值；专员的消息列表从这一句开始累。",
  // 任务移交 · 再一次：原 Agent（专员）停在这里；当前 Agent 换成导购；下一句进导购
  rationaleHandoffSecond:
    "下一句再换成导购 = 任务移交再来一次。专员也不在等导购的返回值；导购的消息列表从这一句开始累。专员没有停在同一次请求里等导购交回一段文字再自己对用户说。",
  toolSource:
    "// 当工具调用 — 子 Agent 当工具，原 Agent 等返回值\n" +
    "const advice = await refundAgent.run({ orderId, issue });\n" +
    "history.push({ from: host, kind: tool-call, name: askRefundAgent, args });\n" +
    "history.push({ from: tool,  kind: tool-result, value: advice });   // ← 专员的话进这里\n" +
    "history.push({ from: host, kind: speech, text: speakAsHost(advice) });\n" +
    "// 下一句仍由 host 接（callSite 还在）",
  handoffSource:
    "// 任务移交（首次）— 改的是当前 Agent，原 Agent 不等返回值\n" +
    "if (needsRefundSpecialist(intent)) {\n" +
    "  activeAgent = refundAgent;\n" +
    "  history.push({ from: host, kind: speech, text: 我把您转到退款专员。 });\n" +
    "  history.push({ from: refund, kind: system, text: 已接手，前情见上 } );\n" +
    "  history.push({ from: refund, kind: speech, text: 我是退款专员。这单可以退，请确认退货地址。 });\n" +
    "}\n" +
    "// 下一句进 refund",
  handoffChainSource:
    "// 任务移交（再交给下一个人）— 改的是当前 Agent，原 Agent 也不等返回值\n" +
    "// 跟首次的差别：原 Agent 是 refund，新 Agent 是 guide；两次都没有「在原地等返回值再对用户说」\n" +
    "if (userAsksForRecommendation(intent) && activeAgent === refundAgent) {\n" +
    "  activeAgent = guideAgent;\n" +
    "  history.push({ from: refund, kind: speech, text: 我把您转到导购，帮您挑替代款。 });\n" +
    "  history.push({ from: guide,  kind: system, text: 已接手，前情见上 });\n" +
    "  history.push({ from: guide,  kind: speech, text: 我是导购。1000 以内有几款不错的... });\n" +
    "}\n" +
    "// 下一句进 guide",
  commonSource:
    "// 共同的「下一句进谁」判据\n" +
    "if (activeAgent === host) {\n" +
    "  // 还在 host → 由 host 接\n" +
    "} else if (activeAgent === refund) {\n" +
    "  // 还在 refund → 由 refund 接\n" +
    "} else {\n" +
    "  // 已经交出去 → 由新 Agent 接（guide 或别人）\n" +
    "}\n" +
    "// 任务移交每发生一次，activeAgent 就换一次。原 Agent 不在原地等新 Agent 的返回值。",
};

// ── 话术循环（写死 5 条；够看几次切换） ──

const HOST_TOOL_RESPONSES = [
  "可以退。这单 7 天内、质量问题可全额退。请确认退货地址，我让专员给你出退货单。",
  "好的，专员收到地址后会再确认一次收件时间。整个退款大约 3 个工作日。",
  "退款审核一般是工作日 24 小时内完成；通过后会原路返回您的支付账户。",
  "专员已经登记。您可以在「我的订单」-「售后」里随时查看进度。",
  "好。我把这一单的处理权继续留在专员这里，您有物流的问题也可以直接问她。",
];

const HOST_HANDOFF_FIRST = "我把您转到退款专员。";
const REFUND_HANDOFF_SECOND = "我把您转到导购，帮您挑替代款。";
const REFUND_TURNS = [
  "我是退款专员。这单可以退，请确认退货地址。",
  "好的，专员收到地址后会再确认一次收件时间。整个退款大约 3 个工作日。",
  "退款审核一般是工作日 24 小时内完成；通过后会原路返回您的支付账户。",
  "我已经把退货登记好了。您可以在「我的订单」-「售后」里随时查看进度。",
  "退款大概 3 个工作日会到账。",
];
const GUIDE_TURNS = [
  "我是导购。1000 以内有几款不错的替代款，我先推荐三款：型号 X（799 元，主动降噪）、型号 Y（899 元，半入耳）、型号 Z（999 元，挂颈式）。您对佩戴方式有偏好吗？",
  "好的。X 这款与您原耳机同厂，主动降噪稍弱一点；Y 偏通勤；Z 偏运动。我先把 X 的链接发您看看。",
  "好。X 这款当前有现货，今天下单明天就能发出。您需要我帮您下单吗？",
  "已经下单了。这单和您之前的退款可以一起在「我的订单」里查。",
  "好。有任何问题随时来找我。",
];

// ── 主流程 ──

/**
 * 推进一次「用户说了下一句」。返回要追加的若干条消息 + 新的当前 Agent + 下一句判据。
 *
 * @param input.mode            tool = 当工具调用；handoff = 任务移交（含链式）
 * @param input.currentAgent    调用方当前是哪一位（host / refund / guide）
 * @param input.userTurnCount   已发了几次用户消息（首次发 = 0；post 后会 +1）
 */
export function sendNext(input: SendNextInput): SendNextOutput {
  const { mode, currentAgent: _currentAgent, userTurnCount } = input;
  logger.info(
    "│ 调用函数-sendNext",
    "调用函数开始：sendNext",
    "为什么写这条日志：route 只认这一层的返回值；返回里讲清这一次追加什么 + 下一句进谁。当前：刚收到前端「发送下一句」请求，要按 mode + currentAgent 决定要不要再换 activeAgent（首次 / 二次移交）。",
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
        { from: "host", kind: "tool-call", text: "调 askRefundAgent（A10086, 右耳无声音）" },
        { from: "host", kind: "tool-result", text: "专员结论：7 天内、质量问题可全额退，需用户确认退货地址" },
        { from: "host", kind: "speech", text: speech },
      ];
    nextCurrentAgent = "host"; // 不换
    rationale = FIXED_SCENARIO.rationaleTool;
  } else {
    // 任务移交（链式）：
    //   - step == 0：host 停在这里 + 移交流 + 切到 refund + refund 接话（首次移交）
    //   - step == 1：refund 停在这里 + 移交流 + 切到 guide + guide 接话（再交给下一个人）
    //   - step >= 2：当前 Agent 已是 guide；guide 继续接话
    if (userTurnCount === 0) {
      appended = [
        { from: "host", kind: "speech", text: HOST_HANDOFF_FIRST },
        { from: "refund", kind: "system", text: "（退款专员成为当前 Agent；前情见上）" },
        { from: "refund", kind: "speech", text: REFUND_TURNS[0] },
      ];
      nextCurrentAgent = "refund"; // 首次切换
      rationale = FIXED_SCENARIO.rationaleHandoffFirst;
    } else if (userTurnCount === 1) {
      appended = [
        { from: "refund", kind: "speech", text: REFUND_HANDOFF_SECOND },
        { from: "guide", kind: "system", text: "（导购成为当前 Agent；前情见上）" },
        { from: "guide", kind: "speech", text: GUIDE_TURNS[0] },
      ];
      nextCurrentAgent = "guide"; // 再次切换
      rationale = FIXED_SCENARIO.rationaleHandoffSecond;
    } else {
      const idx = Math.min(userTurnCount - 2, GUIDE_TURNS.length - 1);
      appended = [
        { from: "guide", kind: "speech", text: GUIDE_TURNS[idx] },
      ];
      nextCurrentAgent = "guide";
      rationale = FIXED_SCENARIO.rationaleHandoffSecond;
    }
  }

  logger.info(
    "│ 调用函数-sendNext",
    "调用函数结束：sendNext",
    "为什么写这条日志：前端拿到这个结果会立刻刷新「当前 Agent」徽标 + 追加消息 + 改下一句判据。当前：已经按 mode + step 算完 appended + nextCurrentAgent + rationale。",
    {
      返回值: { appended, nextCurrentAgent, rationale },
      耗时ms: Date.now() - t0,
    },
  );
  return { appended, nextCurrentAgent, rationale };
}