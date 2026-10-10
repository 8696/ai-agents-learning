/**
 * 本步核心：手写循环（对照模块 07 的 while + 调大模型 + 调工具）。
 * 左栏「手写循环」和中栏「智能体应用」共用这一个 runLoop；
 * 调用方通过 exposeMessages 控制返回里是否暴露 messages 数组 —— 这就是"藏循环"的对照核心。
 *
 * 职责：给定一句用户输入，最多跑 N 圈（消息追加 → 调模型 → 模拟工具 → 再调模型 → ... → 拿到 finalReply）。
 *
 * 数据流：input.text → messages 数组 → while { 调模型 → 调工具（mock） → 再调模型 } → { messages?, rounds, finalReply }。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；学习者打开这一个文件能把"手写循环的 while 长什么样"看完。
 * 真发网络请求 = "调用模型"（走 openai.chat.completions.create）；外面再包一层 runLoop = "调用函数"。
 */
import type OpenAI from "openai";
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

// ── 类型 ──

export type RunLoopInput = {
  /** 用户输入的那一句话，例如 "来一杯中杯热拿铁。" */
  text: string;
  /**
   * 控制返回里是否包含 messages 数组。
   * - true（手写循环）：返回完整 messages + 调用方 + 工具轨迹，对照模块 07 的循环细节。
   * - false（智能体应用）：只返回「产品内部转了几圈 + 最后一句」，模拟产品在背后真转但你看不到。
   */
  exposeMessages: boolean;
  /** 最多跑几圈；防止模型死循环（模块 07 的 maxIterations 闸门）。 */
  maxRounds: number;
};

export type ToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type Message =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type RunLoopOutput = {
  /** 当 exposeMessages=true 时存在；false 循环 + 智能体应用时不返回 —— 模拟"消息列表归产品" */
  messages?: Message[];
  /** 实际跑了多少圈（每一圈 = 一次模型调用） */
  rounds: number;
  /** 给用户看的最终一句 */
  finalReply: string;
  /** 模拟工具的执行记录（无 messages 也能看见工具发生了什么） */
  toolTrace: Array<{ name: string; args: Record<string, unknown>; result: unknown }>;
  /** 这一轮一共发了几次模型请求 */
  modelCalls: number;
  /** 终止原因：natural = 模型自己不再要工具；maxRounds = 闸门触发 */
  stoppedReason: "natural" | "maxRounds";
};

// ── Mock 工具：查库存（咖啡店点单场景）──

const MOCK_INVENTORY: Record<string, { available: boolean; note: string }> = {
  "热拿铁": { available: true, note: "有库存" },
  "冰拿铁": { available: false, note: "今日售罄" },
  "美式":   { available: true, note: "有库存" },
};

function mockToolCheckInventory(drinkName: string): unknown {
  return MOCK_INVENTORY[drinkName] ?? { available: false, note: "菜单里没有这杯" };
}

const TOOL_SCHEMAS: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> = [
  {
    type: "function",
    function: {
      name: "check_inventory",
      description: "查一杯咖啡能不能做。返回 available + note。",
      parameters: {
        type: "object",
        properties: { drink_name: { type: "string", description: "饮品名，如「热拿铁」「冰拿铁」" } },
        required: ["drink_name"],
      },
    },
  },
];

// ── 主流程 ──

/**
 * 跑一轮 while：调模型 → 看是否要工具 → 模拟工具 → 再调模型 → ...
 */
export async function runLoop(input: RunLoopInput): Promise<RunLoopOutput> {
  const llm = getLlm();
  const client = llm.openai;

  logger.info(
    "│ 调用函数-runLoop",
    "调用函数开始：runLoop",
    "为什么写这条日志：本步核心——手写循环的真转法（while + 调模型 + 模拟工具）。左栏 exposeMessages=true 给前端看 messages；中栏 exposeMessages=false 模拟产品内部转圈但你看不到圈。当前：刚收到「来一杯…」",
    {
      入参: input,
      __code: "const out = await runLoop({ text, exposeMessages, maxRounds });",
    },
  );
  const t0 = Date.now();

  const messages: Message[] = [
    {
      role: "system",
      content:
        "你是咖啡店的点单助手。客人问能不能做某杯时，先调 check_inventory(drink_name) 查库存，再告诉客人能不能做。" +
        "**先调工具再看结论**。不要凭名字猜。",
    },
    { role: "user", content: input.text },
  ];

  const toolTrace: RunLoopOutput["toolTrace"] = [];
  let modelCalls = 0;
  let stoppedReason: RunLoopOutput["stoppedReason"] = "natural";
  let finalReply = "";

  for (let round = 1; round <= input.maxRounds; round++) {
    // ── 调模型 ──
    modelCalls++;
    logger.info(
      `│ │ 调用模型-openai.chat.completions`,
      `调用模型开始：第 ${round} 圈 / 共 ${input.maxRounds} 圈`,
      "为什么写这条日志：手写循环每一圈都发一次网络请求；记录消息条数 + 当前是第几圈，方便对照「转了几次」。",
      { messagesLen: messages.length, model: llm.modelA },
    );

    const completion = await client.chat.completions.create({
      model: llm.modelA,
      messages: messages as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
      tools: TOOL_SCHEMAS as unknown as OpenAI.Chat.ChatCompletionTool[],
      tool_choice: "auto",
    });

    const assistantMsg = completion.choices[0]?.message;
    if (!assistantMsg) {
      finalReply = "（模型没回）";
      stoppedReason = "maxRounds";
      break;
    }

    logger.info(
      `│ │ 调用模型-openai.chat.completions`,
      `调用模型结束：第 ${round} 圈`,
      "为什么写这条日志：拿到 finish_reason + content + tool_calls 全文；学习者能从这一条日志对照「模型这一圈要工具 / 直接给答复」。",
      {
        finish_reason: completion.choices[0]?.finish_reason,
        content: assistantMsg.content,
        tool_calls: assistantMsg.tool_calls?.map(function (tc) {
          return { id: tc.id, name: tc.function.name, args: tc.function.arguments };
        }) ?? [],
      },
    );

    // ── 模型没要工具：拿到 finalReply，break ──
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      finalReply = assistantMsg.content ?? "（空答复）";
      stoppedReason = "natural";
      messages.push({ role: "assistant", content: finalReply });
      break;
    }

    // ── 模型要工具：把 assistant 消息（含 tool_calls）追加 + 模拟工具 + 把工具结果追加 ──
    messages.push({
      role: "assistant",
      content: assistantMsg.content,
      tool_calls: assistantMsg.tool_calls.map(function (tc) {
        return { id: tc.id, name: tc.function.name, args: JSON.parse(tc.function.arguments || "{}") };
      }),
    });

    for (const tc of assistantMsg.tool_calls) {
      const args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
      let result: unknown;
      if (tc.function.name === "check_inventory") {
        result = mockToolCheckInventory(String(args.drink_name ?? ""));
      } else {
        result = { error: "未知工具: " + tc.function.name };
      }
      const toolResultStr = JSON.stringify(result);
      toolTrace.push({ name: tc.function.name, args, result });

      logger.info(
        `│ │ │ 调用函数-mockToolCheckInventory`,
        `调用函数结束：${tc.function.name}`,
        "为什么写这条日志：手写循环里工具这一步本地 mock（不动真库存）；记录 args + result，方便学习者对照「查了哪杯 → 返回什么」。",
        {
          入参: args,
          返回值: result,
        },
      );

      messages.push({ role: "tool", tool_call_id: tc.id, content: toolResultStr });
    }
    // 下一圈继续调模型
  }

  if (!finalReply) {
    finalReply = "（闸门触发：到 maxRounds 还没收尾）";
    stoppedReason = "maxRounds";
  }

  const out: RunLoopOutput = {
    rounds: modelCalls,
    finalReply,
    toolTrace,
    modelCalls,
    stoppedReason,
  };
  if (input.exposeMessages) {
    out.messages = messages;
  }

  logger.info(
    "│ 调用函数-runLoop",
    "调用函数结束：runLoop",
    "为什么写这条日志：左栏 exposeMessages=true 才会带 messages；中栏 / 内栏不暴露 messages（智能体应用把消息列表藏了）。当前：返回 finalReply + rounds + toolTrace。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}