/**
 * 本步核心：模拟「单独一个大模型节点」vs「智能体节点」—— 单次调用 ≠ Agent 循环。
 * 真调大模型（协议 A · openai Chat Completions）。
 *
 * 职责：
 *   - runSingleLLMNode(input)：单独一个大模型节点 —— 调一次 LLM（不传 tools），拿 finalReply
 *   - runSmartAgentNode(input)：智能体节点 —— while：调 LLM（带 tools）→ 调工具 → 再调 LLM → ...
 *
 * 数据流：{ text } → 单次调用 / while → { finalReply, rounds, toolTrace }。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；这是和 step-1 中栏「智能体应用」对照的核心 —— 同样输入，左栏走单次调用（不查库存）；右栏走智能体节点（自己查库存 + 自己汇总）。
 */
import type OpenAI from "openai";
import { getLlm, getLlmForProvider, type Llm, type ProviderId } from "../../../../llm.js";
import { logger } from "../logger.js";

// ── 类型 ──

export type LLMNodeInput = {
  text: string;
  maxRounds?: number;
  /** 可选：指定提供商（minimax 不支持 tools，传 zhipu/qwen）；不传 = 用顶层 LLM_PROVIDER */
  provider?: ProviderId;
};

export type ToolTraceItem = { name: string; args: Record<string, unknown>; result: unknown };

export type LLMNodeOutput = {
  text: string;
  /** 跑了多少圈（每一圈 = 一次模型调用） */
  rounds: number;
  /** 给用户的最终一句 */
  finalReply: string;
  /** 调了哪些工具（按调用顺序） */
  toolTrace: ToolTraceItem[];
  stoppedReason: "natural" | "maxRounds";
  /** 这一栏是否传了 tools（true = 智能体；false = 单次大模型节点） */
  passedTools: boolean;
};

// ── Mock 工具：查库存（咖啡店点单场景；与 step-1 同源）──

const MOCK_INVENTORY: Record<string, { available: boolean; note: string }> = {
  "热拿铁": { available: true, note: "有库存" },
  "冰拿铁": { available: false, note: "今日售罄" },
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

// ── 共享：选客户端（带 provider 时按 provider 取）──

function pickLlm(provider?: ProviderId): Llm {
  if (provider) {
    const llm = getLlmForProvider(provider);
    if (!llm) throw new Error(`提供商 ${provider} 未配置 Key（apps/.env 没填该家的 API_KEY）`);
    return llm;
  }
  return getLlm();
}

// ── 左栏主流程：单独一个大模型节点 ──

/**
 * 单次调用 —— 调一次 LLM，**不传 tools**，直接拿 finalReply。
 * 教学点：单次大模型节点 ≠ Agent 循环 —— 模型拿到用户原话就返回 finalReply，
 *        **不会**自己调工具查库存。
 */
export async function runSingleLLMNode(input: LLMNodeInput): Promise<LLMNodeOutput> {
  const llm = pickLlm(input.provider);
  const client = llm.openai;

  logger.info(
    "│ 调用函数-runSingleLLMNode",
    "调用函数开始：runSingleLLMNode",
    "为什么写这条日志：左栏主流程 —— 单独一个大模型节点，调一次 LLM（不传 tools）。教学点：单次调用 ≠ Agent 循环 —— 模型拿到用户原话就返回 finalReply，不会自己查库存。",
    {
      入参: input,
      __code: "const out = await runSingleLLMNode({ text, maxRounds });",
    },
  );
  const t0 = Date.now();

  const messages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content: "你是咖啡店的点单助手。客人问能不能做某杯时，**先调 check_inventory(drink_name) 查库存**再回答。",
    },
    { role: "user", content: input.text },
  ];

  const completion = await client.chat.completions.create({
    model: llm.modelA,
    messages: messages as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
    // 故意不传 tools —— 模拟"单独一个大模型节点"
  });

  const assistantMsg = completion.choices[0]?.message;
  const finalReply = assistantMsg?.content ?? "（空答复）";

  const out: LLMNodeOutput = {
    text: input.text,
    rounds: 1,
    finalReply,
    toolTrace: [], // 单次调用没调工具
    stoppedReason: "natural",
    passedTools: false,
  };

  logger.info(
    "│ 调用函数-runSingleLLMNode",
    "调用函数结束：runSingleLLMNode",
    "为什么写这条日志：左栏调一次 LLM 完成 → finalReply 是模型凭印象给的（没查库存）。前端用 rounds=1 + toolTrace=[] 对照右栏。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}

// ── 右栏主流程：智能体节点（带工具循环）──

/**
 * 智能体节点 —— while：调 LLM（带 tools）→ 调工具 → 再调 LLM → 拿到 finalReply。
 * 教学点：智能体节点 = "把 while + 调工具塞进一个方块" —— 模型自己决定要不要调，调几次。
 */
export async function runSmartAgentNode(input: LLMNodeInput): Promise<LLMNodeOutput> {
  const llm = pickLlm(input.provider);
  const client = llm.openai;
  const maxRounds = input.maxRounds ?? 4;

  logger.info(
    "│ 调用函数-runSmartAgentNode",
    "调用函数开始：runSmartAgentNode",
    "为什么写这条日志：右栏主流程 —— 智能体节点（带工具循环）。while：调 LLM（带 tools）→ 调工具 → 再调 LLM → finalReply。教学点：智能体节点 = 把模块 07 的 while + 调工具塞进一个方块 —— 模型自己决定要不要调，调几次。",
    {
      入参: input,
      __code: "const out = await runSmartAgentNode({ text, maxRounds });",
    },
  );
  const t0 = Date.now();

  const messages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content: "你是咖啡店的点单助手。客人问能不能做某杯时，**先调 check_inventory(drink_name) 查库存**再回答。**先调工具再看结论**。",
    },
    { role: "user", content: input.text },
  ];

  const toolTrace: ToolTraceItem[] = [];
  let modelCalls = 0;
  let stoppedReason: LLMNodeOutput["stoppedReason"] = "natural";
  let finalReply = "";

  for (let round = 1; round <= maxRounds; round++) {
    modelCalls++;
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

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      finalReply = assistantMsg.content ?? "（空答复）";
      stoppedReason = "natural";
      messages.push({ role: "assistant", content: finalReply });
      break;
    }

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
      toolTrace.push({ name: tc.function.name, args, result });
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  if (!finalReply) {
    finalReply = "（闸门触发：到 maxRounds 还没收尾）";
    stoppedReason = "maxRounds";
  }

  const out: LLMNodeOutput = {
    text: input.text,
    rounds: modelCalls,
    finalReply,
    toolTrace,
    stoppedReason,
    passedTools: true,
  };

  logger.info(
    "│ 调用函数-runSmartAgentNode",
    "调用函数结束：runSmartAgentNode",
    "为什么写这条日志：右栏智能体节点跑了 N 圈（≥1）→ finalReply 是模型在看到工具结果之后给的。前端用 rounds ≥ 1 + toolTrace ≠ [] 对照左栏。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}