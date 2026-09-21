/**
 * 本步核心：charge_member_card 工具模拟超时失败，框架默认重试，演示「默默双扣」。
 *
 * 职责：缺口 #6（变体 E · 默认策略 · 重试）。execute 函数每次被调用都「扣款」
 *       （记账到 attempts 数组），30% 概率模拟支付网关超时抛错。框架自动重试，
 *       每次重试都触发 execute → attempts 数组累计多次扣款 = 双扣事故。
 *
 * 数据流：runRetryCharge → generateText({ tools: { charge_member_card } }, stopWhen: isStepCount(5))
 *         → 框架失败重试（最多 maxRetries 次）→ 成功或耗尽 → 返回 attempts 详情。
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

const SYSTEM_PROMPT =
  "你是点咖啡小程序的收银员。客人要点单：客人要点这单并用会员卡支付。" +
  "你**必须**调用 charge_member_card 工具扣款，传入 orderId 和 idempotencyKey 两个参数。" +
  "扣款可能因为支付网关超时失败；如果工具抛出「支付网关超时」错误，你**必须继续重试调用**直到扣款成功，**不能空口说扣款成功**。每次调用工具都会真正扣款，所以多次调用 = 多次扣款。";

// 模拟扣款流水：每次 execute 调用都记账（无论成功失败）
const chargeAttempts: Array<{ attempt: number; orderId: string; idempotencyKey: string; result: "charged" | "timeout"; timestamp: number }> = [];
let attemptCounter = 0;

function genIdempotencyKey(orderId: string): string {
  // 模拟「业务方传入的幂等键」。框架重试时，**业务方应该每次传同一个键**（这样网关能去重）。
  // 但如果业务方每次 generateText 重试时键变了 → 框架默默双扣。
  return `idem-${orderId}-abc123`;
}

export type ChargeResult = {
  ok: true;
  attempt: number;
  charged: number;
  idempotencyKey: string;
  attempts: Array<{ attempt: number; orderId: string; idempotencyKey: string; result: "charged" | "timeout" }>;
  elapsedMs: number;
};

export async function runRetryCharge(utterance: string): Promise<ChargeResult> {
  const started = Date.now();
  const orderId = "order-" + Math.floor(Math.random() * 10000).toString();
  const idempotencyKey = genIdempotencyKey(orderId);

  // 清空上一次跑的数据（保证每次调用独立计数）
  chargeAttempts.length = 0;
  attemptCounter = 0;

  logger.info(
    "runRetryCharge",
    "调用函数：runRetryCharge",
    "入口：扣会员卡支付，框架默认重试；execute 每次被调用都记账 → 双扣可观察。",
    {
      入参: { utterance, orderId, idempotencyKey },
    }
  );

  const llm = getLlm();
  const provider = createOpenAI({
    apiKey: llm.apiKey,
    baseURL: llm.baseUrlA,
    name: llm.provider,
  });
  const model = provider.chat(llm.modelA);

  const chargeTool = tool({
    description:
      "扣会员卡支付订单。必须传入 orderId（订单号）。如果支付网关超时，工具会抛错；你必须如实告诉客人扣款未完成，**不能空口说成功**。",
    inputSchema: z.object({
      orderId: z.string().describe("订单号"),
      idempotencyKey: z.string().describe("幂等键（防止重试时重复扣款）"),
    }),
    execute: async (raw) => {
      attemptCounter += 1;
      const currentAttempt = attemptCounter;
      // 50% 概率模拟支付网关超时（超时语义：网关可能扣了但没响应）
      const isTimeout = Math.random() < 0.5;
      // 关键：每次 execute 调用都记 attempts（不论超时还是成功）= 一次「扣款尝试」
      // 现实里网关超时可能已扣款（账上扣了但没响应），所以 attempts = 实际可能扣款次数
      chargeAttempts.push({
        attempt: currentAttempt,
        orderId: raw.orderId,
        idempotencyKey: raw.idempotencyKey,
        result: isTimeout ? "timeout" : "charged",
        timestamp: Date.now(),
      });
      logger.info("│ charge_member_card", isTimeout ? "调用函数：execute（超时）" : "调用函数：execute（成功）", "每次 execute 都记一次扣款尝试；超时可能已扣款。", {
        attempt: currentAttempt,
        orderId: raw.orderId,
        idempotencyKey: raw.idempotencyKey,
        isTimeout,
      });
      if (isTimeout) {
        throw new Error("支付网关超时（模拟）");
      }
      return {
        ok: true,
        attempt: currentAttempt,
        orderId: raw.orderId,
        idempotencyKey: raw.idempotencyKey,
        message: "扣款成功。",
      };
    },
  });

  const 入参 = {
    model: llm.modelA,
    system: SYSTEM_PROMPT,
    prompt: `客人要点这单：${utterance}\n\n请扣会员卡支付，订单号 orderId = "${orderId}"，幂等键 = "${idempotencyKey}"。`,
    tools: { charge_member_card: chargeTool },
    stopWhen: "isStepCount(5) — 失败也会重试最多 maxRetries 次",
    maxRetries: "AI SDK 默认 2（一次 generateText 内 tool 失败会重试 2 次）",
  };
  logger.info("│ generateText", "调用函数：generateText（带 retry）", "默认 maxRetries；超时抛错会自动重试。", { 入参 });

  const generateStarted = Date.now();
  let finalText = "";
  let stoppedReason = "final_answer";
  let errorMessage: string | null = null;
  try {
    const raw = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: `客人要点这单：${utterance}\n\n请扣会员卡支付，订单号 orderId = "${orderId}"，幂等键 = "${idempotencyKey}"。`,
      tools: { charge_member_card: chargeTool },
      stopWhen: isStepCount(5),
    });
    finalText = String(raw.text ?? "");
    logger.info("│ generateText", "结束：generateText", "扣款完成（可能多次重试）。", {
      耗时ms: Date.now() - generateStarted,
      返回值: raw,
    });
  } catch (error: unknown) {
    errorMessage = error instanceof Error ? error.message : String(error);
    stoppedReason = "max_retries_or_error";
    logger.warn("│ generateText", "结束：generateText（失败）", "框架重试耗尽或工具持续超时。", {
      耗时ms: Date.now() - generateStarted,
      返回值: { message: errorMessage },
    });
  }

  const result: ChargeResult = {
    ok: true,
    attempt: attemptCounter,
    charged: chargeAttempts.filter((a) => a.result === "charged").length,
    idempotencyKey,
    attempts: chargeAttempts.map((a) => ({
      attempt: a.attempt,
      orderId: a.orderId,
      idempotencyKey: a.idempotencyKey,
      result: a.result,
    })),
    elapsedMs: Date.now() - started,
  };
  logger.info("runRetryCharge", "结束：runRetryCharge", `尝试 ${result.attempt} 次，实际扣款 ${result.charged} 次；幂等键 ${result.idempotencyKey}。`, {
    耗时ms: result.elapsedMs,
    返回值: result,
    errorMessage,
    finalText,
    stoppedReason,
  });
  return result;
}