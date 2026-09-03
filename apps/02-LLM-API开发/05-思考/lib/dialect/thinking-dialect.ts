/**
 * 职责：四家生产模型 × 协议 A/B 的思考方言表（只描述官方怎么开、怎么关、回哪个字段）。
 * 数据流：ProductionProviderId + 开/关 → DialectCard / ProtocolAPlan / ProtocolBPlan。
 * 实际 HTTP 是否认这些键，以这一轮响应为准，页面会再标实测位置。
 *
 * 对照：
 *   MiniMax OpenAI / Anthropic 文档
 *   智谱 docs.bigmodel.cn · GLM-5.3 / 深度思考
 *   DeepSeek api-docs · 思考模式
 *   百炼 / DashScope · 深度思考 + Anthropic Messages
 *
 * 算法不要改：卡片文案和 plan* 分支是本条教学内容。
 */
import type { ProductionProviderId } from "../../../../llm.js";

export type ProtocolKind = "A" | "B";
export type ReturnWhere = "separate_field" | "in_content" | "separate_or_in_content" | "none";

export type DialectCard = {
  defaultOn: boolean;
  canDisable: boolean;
  howOn: string;
  howOff: string;
  returnWhere: ReturnWhere;
  returnField: string;
  notes: string;
};

export type ProtocolAPlan = {
  skip?: string;
  extraBody?: Record<string, unknown>;
  /** DeepSeek 思考模式会忽略 temperature / top_p，不要假装旋钮有效 */
  omitSampling?: boolean;
  explain: DialectCard;
};

export type ProtocolBPlan = {
  skip?: string;
  thinking?: Record<string, unknown>;
  outputConfig?: { effort: "low" | "high" | "max" };
  explain: DialectCard;
};

const MINIMAX_A_ON_SPLIT: DialectCard = {
  defaultOn: true,
  canDisable: true,
  howOn: "extra_body.thinking.type = adaptive（省略也默认开）",
  howOff: "extra_body.thinking.type = disabled",
  returnWhere: "separate_field",
  returnField: "delta.reasoning_details[].text 与 delta.reasoning_content",
  notes: "reasoning_split 只改位置，不负责开关。true = 官方应走独立字段；false = 嵌进 content 的 think 标记。国内站实测仍可能嵌在 content 里，以这一轮 sources 为准。",
};

const MINIMAX_A_ON_INLINE: DialectCard = {
  ...MINIMAX_A_ON_SPLIT,
  returnWhere: "in_content",
  returnField: "delta.content 里的 <think>…</think>",
  notes: "未开 reasoning_split 时，思考和正文挤在同一段 content 里，页面用标记切开。",
};

const MINIMAX_A_OFF: DialectCard = {
  defaultOn: true,
  canDisable: true,
  howOn: "extra_body.thinking.type = adaptive",
  howOff: "extra_body.thinking.type = disabled",
  returnWhere: "none",
  returnField: "关思考后不应再有思考增量",
  notes: "M3 可以关。M2.x 文档写明关不掉。",
};

const MINIMAX_B_ON: DialectCard = {
  defaultOn: false,
  canDisable: true,
  howOn: "顶层 thinking.type = adaptive（MiniMax 不用 enabled + budget_tokens）",
  howOff: "省略 thinking，或 thinking.type = disabled",
  returnWhere: "separate_field",
  returnField: "content_block_delta.delta.thinking（正文走 delta.text）",
  notes: "协议 B 默认关。adaptive 对 M3 就是开。思考永远是独立 block，不会嵌进 text。",
};

const MINIMAX_B_OFF: DialectCard = {
  ...MINIMAX_B_ON,
  returnWhere: "none",
  returnField: "关思考后没有 thinking 块",
  notes: "省略或 disabled 都应只剩 text 块。",
};

const ZHIPU_A_ON: DialectCard = {
  defaultOn: true,
  canDisable: false,
  howOn: "extra_body.thinking.type = enabled（默认就是开；可用 reasoning_effort=low|high|max）",
  howOff: "不能关。传 disabled 官方会报错，本 Demo 不会发这条请求",
  returnWhere: "separate_field",
  returnField: "delta.reasoning_content（与 content 同级）",
  notes: "GLM-5.3 强制思考。强度用 reasoning_effort，默认 max；本 Demo 用 high 以免一轮拖太久。",
};

const ZHIPU_B_ON: DialectCard = {
  defaultOn: true,
  canDisable: false,
  howOn: "默认就想。本 Demo 不传 thinking 对象，避免和 Anthropic 的 enabled+budget 打架",
  howOff: "不能关。官方 Claude 兼容里关思考会映射成 low，不是真关",
  returnWhere: "separate_field",
  returnField: "content_block_delta.delta.thinking",
  notes: "GLM-5.3 协议 B 同样强制思考。正文是 type=text 的另一块。",
};

const DEEPSEEK_A_ON: DialectCard = {
  defaultOn: true,
  canDisable: true,
  howOn: "extra_body.thinking.type = enabled，另带 reasoning_effort（默认 high）",
  howOff: "extra_body.thinking.type = disabled",
  returnWhere: "separate_field",
  returnField: "delta.reasoning_content（与 content 同级）",
  notes: "思考模式下 temperature / top_p 会被忽略。无 tools 时追问不必回传 reasoning_content。",
};

const DEEPSEEK_A_OFF: DialectCard = {
  ...DEEPSEEK_A_ON,
  returnWhere: "none",
  returnField: "关思考后没有 reasoning_content",
  notes: "协议 A 才有官方开关。关了应只剩 content。",
};

const DEEPSEEK_B_ON: DialectCard = {
  defaultOn: true,
  canDisable: false,
  howOn: "官方 Anthropic 格式没有 thinking 开关；默认就开。强度走 output_config.effort",
  howOff: "官方表这一格是空的。要关请走协议 A 的 thinking.disabled",
  returnWhere: "separate_field",
  returnField: "content_block_delta.delta.thinking",
  notes: "effort 默认 high。本 Demo 开思考时带 output_config.effort=high。",
};

const QWEN_A_ON: DialectCard = {
  defaultOn: true,
  canDisable: true,
  howOn: "extra_body.enable_thinking = true（qwen3.8-max 默认开；不是 MiniMax 那套 thinking.type）",
  howOff: "extra_body.enable_thinking = false",
  returnWhere: "separate_field",
  returnField: "delta.reasoning_content（与 content 同级）",
  notes: "百炼 OpenAI 兼容口用 enable_thinking。qwen3.8-max 默认还会 preserve_thinking，追问要把 reasoning_content 原样回传。",
};

const QWEN_A_OFF: DialectCard = {
  ...QWEN_A_ON,
  returnWhere: "none",
  returnField: "关思考后没有 reasoning_content",
  notes: "hybrid 模型可以关。关了应只剩 content。",
};

const QWEN_B_ON: DialectCard = {
  defaultOn: true,
  canDisable: true,
  howOn: "顶层 thinking: { type: enabled, budget_tokens }（官方示例就是这样）",
  howOff: "thinking: { type: disabled }",
  returnWhere: "separate_field",
  returnField: "content_block_delta.delta.thinking",
  notes: "max_tokens 必须大于 budget_tokens。正文走 delta.text。",
};

const QWEN_B_OFF: DialectCard = {
  ...QWEN_B_ON,
  returnWhere: "none",
  returnField: "关思考后没有 thinking 块",
  notes: "官方示例对 qwen3.8-max 传 disabled 就是关。",
};

export function officialCards(id: ProductionProviderId): { a: DialectCard; b: DialectCard } {
  if (id === "minimax") {
    return { a: MINIMAX_A_ON_SPLIT, b: MINIMAX_B_ON };
  }
  if (id === "zhipu") {
    return { a: ZHIPU_A_ON, b: ZHIPU_B_ON };
  }
  if (id === "qwen") {
    return { a: QWEN_A_ON, b: QWEN_B_ON };
  }
  return { a: DEEPSEEK_A_ON, b: DEEPSEEK_B_ON };
}

export function planProtocolA(
  id: ProductionProviderId,
  thinkingOn: boolean,
  reasoningSplit: boolean,
): ProtocolAPlan {
  if (id === "minimax") {
    if (!thinkingOn) {
      return {
        extraBody: { thinking: { type: "disabled" } },
        explain: MINIMAX_A_OFF,
      };
    }
    return {
      extraBody: {
        thinking: { type: "adaptive" },
        reasoning_split: reasoningSplit,
      },
      explain: reasoningSplit ? MINIMAX_A_ON_SPLIT : MINIMAX_A_ON_INLINE,
    };
  }

  if (id === "zhipu") {
    if (!thinkingOn) {
      return {
        skip: "GLM-5.3 强制思考，传 thinking.type=disabled 会失败。这一列未发请求。",
        explain: ZHIPU_A_ON,
      };
    }
    return {
      extraBody: {
        thinking: { type: "enabled" },
        reasoning_effort: "high",
      },
      explain: ZHIPU_A_ON,
    };
  }

  if (id === "qwen") {
    if (!thinkingOn) {
      return {
        extraBody: { enable_thinking: false },
        explain: QWEN_A_OFF,
      };
    }
    return {
      extraBody: { enable_thinking: true },
      explain: QWEN_A_ON,
    };
  }

  // deepseek
  if (!thinkingOn) {
    return {
      extraBody: { thinking: { type: "disabled" } },
      omitSampling: true,
      explain: DEEPSEEK_A_OFF,
    };
  }
  return {
    extraBody: {
      thinking: { type: "enabled" },
      reasoning_effort: "high",
    },
    omitSampling: true,
    explain: DEEPSEEK_A_ON,
  };
}

export function planProtocolB(id: ProductionProviderId, thinkingOn: boolean): ProtocolBPlan {
  if (id === "minimax") {
    if (!thinkingOn) {
      return {
        thinking: { type: "disabled" },
        explain: MINIMAX_B_OFF,
      };
    }
    return {
      thinking: { type: "adaptive" },
      explain: MINIMAX_B_ON,
    };
  }

  if (id === "zhipu") {
    if (!thinkingOn) {
      return {
        skip: "GLM-5.3 协议 B 也不能关思考。关思考请换 MiniMax 或 DeepSeek 协议 A。这一列未发请求。",
        explain: ZHIPU_B_ON,
      };
    }
    return {
      explain: ZHIPU_B_ON,
    };
  }

  if (id === "qwen") {
    if (!thinkingOn) {
      return {
        thinking: { type: "disabled" },
        explain: QWEN_B_OFF,
      };
    }
    return {
      thinking: { type: "enabled", budget_tokens: 1024 },
      explain: QWEN_B_ON,
    };
  }

  // deepseek：Anthropic 格式官方没有 thinking 开关
  if (!thinkingOn) {
    return {
      skip: "DeepSeek 官方 Anthropic 格式没有 thinking 开关（文档该格为空）。要关请走协议 A。这一列未发请求。",
      explain: DEEPSEEK_B_ON,
    };
  }
  return {
    outputConfig: { effort: "high" },
    explain: DEEPSEEK_B_ON,
  };
}
