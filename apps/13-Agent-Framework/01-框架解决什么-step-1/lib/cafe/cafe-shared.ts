/**
 * 职责：点咖啡小程序这一步共用的客人原话、系统提示词、吧台工具 make_latte。
 *
 * 数据流：页面把默认原话交给循环 → 模型按系统提示词必须调 make_latte → executeMakeLatte 返回出杯结果（本地函数，不是真咖啡机）。
 */

export const DEFAULT_UTTERANCE = "来一杯中杯热拿铁。";

export const SYSTEM_PROMPT =
  "你是点咖啡小程序的店员。客人点饮品时，必须调用工具 make_latte 真正出杯，" +
  "禁止空口说已经做好了。杯型：小杯 small、中杯 medium、大杯 large。拿铁的 drink 填 latte。" +
  "工具返回后，用一两句中文告诉客人做好了。";

export const MAKE_LATTE_NAME = "make_latte";

export const MAKE_LATTE_DESCRIPTION =
  "在吧台做一杯咖啡。客人点拿铁、美式等饮品时必须调用。不要在没调用本工具时声称已经出杯。";

export type CupSize = "small" | "medium" | "large";

export type MakeLatteArgs = {
  cupSize: CupSize;
  drink: string;
};

export type MakeLatteResult = {
  ok: true;
  cupSize: CupSize;
  drink: string;
  message: string;
};

const CUP_LABEL: Record<CupSize, string> = {
  small: "小杯",
  medium: "中杯",
  large: "大杯",
};

export function executeMakeLatte(args: MakeLatteArgs): MakeLatteResult {
  const cupSize: CupSize =
    args.cupSize === "small" || args.cupSize === "large" ? args.cupSize : "medium";
  const drink = String(args.drink || "latte");
  return {
    ok: true,
    cupSize,
    drink,
    message: `${CUP_LABEL[cupSize]}${drink} 已经做好了，大约 3 分钟。`,
  };
}

export const MAKE_LATTE_OPENAI_TOOL = {
  type: "function" as const,
  function: {
    name: MAKE_LATTE_NAME,
    description: MAKE_LATTE_DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        cupSize: {
          type: "string",
          enum: ["small", "medium", "large"],
          description: "杯型：small 小杯 / medium 中杯 / large 大杯",
        },
        drink: {
          type: "string",
          description: "饮品英文名，例如 latte",
        },
      },
      required: ["cupSize", "drink"],
    },
  },
};

export type TrajectoryRound = {
  round: number;
  modelCalled: boolean;
  finishReason: string | null;
  toolCallCount: number;
  toolNames: string[];
  assistantPreview: string;
  toolResults: MakeLatteResult[];
};

export type LoopRunResult = {
  utterance: string;
  hasWhileInBusinessCode: boolean;
  frameworkPackage: string | null;
  modelCallCount: number;
  toolExecutedCount: number;
  stoppedReason: "final_answer" | "max_rounds";
  finalAnswer: string;
  rounds: TrajectoryRound[];
  elapsedMs: number;
};
