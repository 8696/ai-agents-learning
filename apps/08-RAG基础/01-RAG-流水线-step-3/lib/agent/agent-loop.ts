/**
 * 职责：最小 agent 循环。手写 while，不 import 模块 07（[AGENTS.md §0.3 禁止 import apps/07-手写Agent/]）。
 * 数据流：用户问 → 调聊天（带 search_knowledge 工具） → 模型决定要不要搜 → 搜就执行工具 + 喂回结果 → 再调一次 → 直到模型不再调工具，给最终答案。
 */
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getLlm } from "../../../../llm.js";
import { HttpError } from "../http/send-error.js";
import { maskSecret, withCall } from "../log/with-call.js";
import { searchKnowledge } from "../tools/search-knowledge.js";

const MAX_ROUNDS = 3;

const TOOLS: import("openai/resources/chat/completions").ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description:
        "查售后内部手册（建库时已经把 Markdown / PDF 切块向量入库）。返回 Top-3 切块 + 来源 + 分数。闲聊、招呼、跟售后无关的问题不要调。",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "要查的问题，例如「杯子裂了怎么退」",
          },
        },
        required: ["question"],
      },
    },
  },
];

export type AgentRound = {
  round: number;
  assistantContent: string | null;
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: unknown }>;
  stoppedReason: "no-tool-calls" | "max-rounds" | "stop";
};

export type AgentResult = {
  question: string;
  rounds: AgentRound[];
  finalAnswer: string;
  totalRounds: number;
  searchCount: number;
  stepsRan: Array<"plan" | "act" | "observe" | "answer">;
};

function summarizeToolResult(result: unknown): string {
  // tool 返回的是 SearchKnowledgeResult，里面 hits 可能很大；agent 喂回给模型时用一段简短文字即可
  const r = result as { hitCount?: number; maxScore?: number; hits?: Array<{ source: string; section: string; text: string }> };
  if (typeof r.hitCount !== "number") return JSON.stringify(result);
  if (r.hitCount === 0) return "（库里没有命中）";
  return r.hits!
    .map((h, i) => `【材料${i + 1}】${h.source} / ${h.section}\n${h.text.slice(0, 400)}`)
    .join("\n\n");
}

export async function runAgent(question: string): Promise<AgentResult> {
  const llm = getLlm();
  return withCall({
    scope: "调用函数-runAgent",
    kind: "函数",
    name: "runAgent",
    explain: "最小 agent 循环。手写 while：模型决定要不要调 search_knowledge，调了就把结果喂回去再问一次，直到模型不再调。",
    args: { question, maxRounds: MAX_ROUNDS, embeddingModel: llm.embeddingModel, chatModel: llm.modelA, apiKey: maskSecret(llm.apiKey) },
    code: "while (true) { chat.completions.create({ tools }); 调 tool 喂回去；不再调就 break }",
    run: async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content:
            "你是售后助手。能用 search_knowledge 查内部手册。闲聊 / 跟售后无关的招呼不用调。问政策、问流程、问具体商品才调。",
        },
        { role: "user", content: question },
      ];

      const rounds: AgentRound[] = [];
      const stepsRan: AgentResult["stepsRan"] = ["plan"];
      let searchCount = 0;

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const response = await llm.openai.chat.completions.create({
          model: llm.modelA,
          messages,
          tools: TOOLS,
          tool_choice: "auto",
        });
        const msg = response.choices[0]?.message;
        if (!msg) {
          throw new HttpError(502, "聊天接口无 message", "看日志的完整返回值");
        }
        messages.push(msg);

        const toolCallsInRound: AgentRound["toolCalls"] = [];

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const call of msg.tool_calls) {
            if (call.function.name !== "search_knowledge") continue;
            const args = JSON.parse(call.function.arguments) as { question: string };
            const result = await searchKnowledge(args.question);
            toolCallsInRound.push({ name: call.function.name, args, result });
            searchCount++;
            stepsRan.push("act");
            const toolMessage: ChatCompletionMessageParam = {
              role: "tool",
              tool_call_id: call.id,
              content: summarizeToolResult(result),
            };
            messages.push(toolMessage);
            stepsRan.push("observe");
          }
          rounds.push({
            round: round + 1,
            assistantContent: msg.content ?? null,
            toolCalls: toolCallsInRound,
            stoppedReason: "stop",
          });
        } else {
          // 没调 tool → 给出最终答案
          rounds.push({
            round: round + 1,
            assistantContent: msg.content ?? null,
            toolCalls: [],
            stoppedReason: "no-tool-calls",
          });
          stepsRan.push("answer");
          return {
            question,
            rounds,
            finalAnswer: msg.content ?? "",
            totalRounds: round + 1,
            searchCount,
            stepsRan,
          };
        }
      }

      // 跑了 MAX_ROUNDS 轮还在调 tool → 用最后一轮的 assistant content 当答案
      const lastAssistantContent = [...rounds].reverse().find((r) => r.assistantContent)?.assistantContent ?? "（已到最大轮数，模型仍在调工具）";
      stepsRan.push("answer");
      return {
        question,
        rounds,
        finalAnswer: lastAssistantContent,
        totalRounds: MAX_ROUNDS,
        searchCount,
        stepsRan,
      };
    },
  });
}