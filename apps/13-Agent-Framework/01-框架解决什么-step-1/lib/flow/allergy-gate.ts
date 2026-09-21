/**
 * 本步核心：make_latte 工具网关版——过敏标记 → 网关拒绝执行。
 *
 * 职责：缺口 #7（变体 I · 框架解决不了）。execute 函数每次调用都过网关层，
 *       如果 allergy=true → 网关拒绝（return ok:false，框架把拒绝原因塞回 messages）；
 *       如果 allergy=false → 网关放行，出杯成功。框架循环仍在跑，
 *       网关只是拒绝执行 = 拒绝原因回到页面，不被框架内部吞掉。
 *
 * 数据流：runAllergyGate → generateText({ tools: { make_latte } }) → 框架循环 → execute 网关。
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

const SYSTEM_PROMPT =
  "你是点咖啡小程序的店员。客人点饮品时，必须调用 make_latte 工具出杯。" +
  "如果工具返回 ok=false（网关拒绝），你**必须如实**告诉客人不能做，**不能空口说扣款/出杯成功**。" +
  "杯型：小杯 small、中杯 medium、大杯 large。拿铁的 drink 填 latte。";

// 模拟「会话标记」：每次调用 runAllergyGate 时重置
let allergyFlag = false;
const attempts: Array<{ attempt: number; rejected: boolean; reason: string; cupSize: string }> = [];
let attemptCounter = 0;

export type AllergyResult = {
  ok: boolean;
  allergy: boolean;
  rejected: boolean;
  reason: string;
  attempts: Array<{ attempt: number; rejected: boolean; reason: string; cupSize: string }>;
  finalText: string;
  elapsedMs: number;
};

export async function runAllergyGate(
  utterance: string,
  options?: { allergy?: boolean }
): Promise<AllergyResult> {
  const started = Date.now();
  const allergy = options?.allergy ?? false;
  allergyFlag = allergy;
  attempts.length = 0;
  attemptCounter = 0;

  logger.info(
    "runAllergyGate",
    "调用函数：runAllergyGate",
    "入口：make_latte 网关版；allergy=true 时网关拒绝执行；框架循环仍在跑，拒绝原因回到 messages。",
    {
      入参: { utterance, allergy },
    }
  );

  const llm = getLlm();
  const provider = createOpenAI({
    apiKey: llm.apiKey,
    baseURL: llm.baseUrlA,
    name: llm.provider,
  });
  const model = provider.chat(llm.modelA);

  const makeLatteTool = tool({
    description:
      "在吧台做一杯拿铁（含奶咖）。客人点拿铁时必须调用此工具。如果客人标记过敏，网关会拒绝执行；你必须如实告诉客人不能做，**不能空口说出杯成功**。",
    inputSchema: z.object({
      cupSize: z.enum(["small", "medium", "large"]).describe("杯型"),
    }),
    execute: async (raw) => {
      attemptCounter += 1;
      const cupSize = raw.cupSize;
      // 网关层：检查过敏标记
      if (allergyFlag) {
        const reason = "客人牛奶过敏，网关拒绝执行 make_latte。";
        attempts.push({ attempt: attemptCounter, rejected: true, reason, cupSize });
        logger.info("│ make_latte", "调用函数：execute（网关拒绝）", "过敏标记 → 网关拦下 → 拒绝原因回到 messages。", {
          attempt: attemptCounter,
          cupSize,
          allergy: allergyFlag,
        });
        return { ok: false, rejected: true, reason };
      }
      attempts.push({ attempt: attemptCounter, rejected: false, reason: "出杯成功", cupSize });
      logger.info("│ make_latte", "调用函数：execute（出杯成功）", "网关放行 → 出杯。", {
        attempt: attemptCounter,
        cupSize,
      });
      const cupLabel = cupSize === "small" ? "小杯" : cupSize === "large" ? "大杯" : "中杯";
      return {
        ok: true,
        rejected: false,
        cupSize,
        drink: "latte",
        message: `${cupLabel}拿铁 已经做好了，大约 3 分钟。`,
      };
    },
  });

  const generateStarted = Date.now();
  let finalText = "";
  let stoppedReason: string = "final_answer";
  try {
    const raw = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: utterance,
      tools: { make_latte: makeLatteTool },
      stopWhen: isStepCount(5),
    });
    finalText = String(raw.text ?? "");
    logger.info("│ generateText", "结束：generateText", "框架循环完成；最终模型回复（可能是拒绝消息）。", {
      耗时ms: Date.now() - generateStarted,
      返回值: raw,
    });
  } catch (error: unknown) {
    finalText = error instanceof Error ? error.message : String(error);
    stoppedReason = "exception";
    logger.warn("│ generateText", "结束：generateText（异常）", "框架跑出异常。", {
      耗时ms: Date.now() - generateStarted,
      返回值: { message: finalText },
    });
  }

  const rejectedAttempts = attempts.filter((a) => a.rejected);
  const result: AllergyResult = {
    ok: true,
    allergy,
    rejected: rejectedAttempts.length > 0,
    reason: rejectedAttempts.length > 0
      ? rejectedAttempts[0].reason
      : attempts.length > 0
        ? attempts[0].reason
        : "模型未调用工具",
    attempts: [...attempts],
    finalText,
    elapsedMs: Date.now() - started,
  };
  logger.info("runAllergyGate", "结束：runAllergyGate", `过敏标记=${allergy}，网关拒绝=${result.rejected}，${attempts.length} 次 execute 调用。`, {
    耗时ms: result.elapsedMs,
    返回值: result,
    stoppedReason,
  });
  return result;
}