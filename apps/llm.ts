/**
 * 顶层 LLM 选用：提供商 + 模型。各 Demo 只拿客户端，不关心现在是哪一家。
 *
 * 职责：读 apps/.env 的「选用」两行，拼出当前提供商的协议 A / 协议 B 客户端。
 *
 * 数据流：
 *   loadRootEnv() 读 apps/.env
 *     → LLM_PROVIDER（minimax | zhipu | deepseek | qwen | custom）选出目录里的一组变量
 *     → LLM_MODEL 可选覆盖该组默认模型
 *     → new OpenAI({ apiKey, baseURL })     协议 A · Chat Completions
 *     → new Anthropic({ apiKey, baseURL })  协议 B · Messages API
 *     → Demo 只用 llm.openai / llm.anthropic / llm.modelA / llm.modelB
 *
 * 为什么存在：
 *   MiniMax、智谱、DeepSeek、千问、自定义网关本质都是「一家 Key、两套协议」。
 *   SSE / Prompt / 取消这类 Demo 讲的是协议行为，不该在每个 server.ts 里写死 MiniMax。
 *   换线路只改 .env 的 LLM_PROVIDER，不要改小节代码。
 *
 * Demo 用法：
 *   import { getLlm } from "../../llm.js";
 *   const llm = getLlm();
 *   await llm.openai.chat.completions.create({ model: llm.modelA, … })
 *   await llm.anthropic.messages.create({ model: llm.modelB, max_tokens: llm.maxTokensB, … })
 *
 * 对照：load-root-env.ts 只灌环境变量；本文件才「选用 + 建客户端」。
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import { loadRootEnv } from "./load-root-env.js";

// ── 提供商 id：必须和 apps/.env 里 LLM_PROVIDER 的取值一致 ──
export const PROVIDER_IDS = ["minimax", "zhipu", "deepseek", "qwen", "custom"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * Demo 拿到的运行时对象。协议对照 Demo 同时用 openai + anthropic（同一家、同一把 Key）。
 * 只跑协议 A 的 Demo 只用 openai + modelA 即可。
 */
export type Llm = {
  provider: ProviderId;
  /** 与 modelA 相同，给「只关心当前模型 id」的 Demo 少写一个字段 */
  model: string;
  /** 协议 A 请求体里的 model */
  modelA: string;
  /** 协议 B 请求体里的 model；多数网关与 A 相同，少数网关两边 id 不一样 */
  modelB: string;
  openai: OpenAI;
  anthropic: Anthropic;
  baseUrlA: string;
  baseUrlB: string;
  apiKey: string;
  /** 协议 B 的 max_tokens 必填；学习阶段默认 1024，可用 LLM_ANTHROPIC_MAX_TOKENS 改 */
  maxTokensB: number;
};

/** 一家提供商在 .env 里的变量名 + 缺省 URL/模型。新增一家 = 往 CATALOG 加一行。 */
type ProviderCatalog = {
  label: string;
  keyEnv: string;
  baseAEnv: string;
  baseBEnv: string;
  modelAEnv: string;
  modelBEnv: string;
  defaultBaseA: string;
  defaultBaseB: string;
  defaultModel: string;
};

// ── 目录：变量名 ↔ 默认值。实际 Key 只在 apps/.env，不写进本文件 ──
const CATALOG: Record<ProviderId, ProviderCatalog> = {
  minimax: {
    label: "MiniMax",
    keyEnv: "MINIMAX_API_KEY",
    baseAEnv: "MINIMAX_BASE_URL",
    baseBEnv: "MINIMAX_ANTHROPIC_BASE_URL",
    modelAEnv: "MINIMAX_MODEL",
    modelBEnv: "MINIMAX_ANTHROPIC_MODEL",
    // 国内站；不要默认成 api.minimax.io（海外账密不通用）
    defaultBaseA: "https://api.minimaxi.com/v1",
    defaultBaseB: "https://api.minimaxi.com/anthropic",
    defaultModel: "MiniMax-M3",
  },
  zhipu: {
    label: "智谱 GLM",
    keyEnv: "ZHIPU_API_KEY",
    baseAEnv: "ZHIPU_BASE_URL",
    baseBEnv: "ZHIPU_ANTHROPIC_BASE_URL",
    modelAEnv: "ZHIPU_MODEL",
    modelBEnv: "ZHIPU_ANTHROPIC_MODEL",
    defaultBaseA: "https://open.bigmodel.cn/api/paas/v4/",
    defaultBaseB: "https://open.bigmodel.cn/api/anthropic",
    defaultModel: "glm-4-flash",
  },
  deepseek: {
    label: "DeepSeek",
    keyEnv: "DEEPSEEK_API_KEY",
    baseAEnv: "DEEPSEEK_BASE_URL",
    baseBEnv: "DEEPSEEK_ANTHROPIC_BASE_URL",
    modelAEnv: "DEEPSEEK_MODEL",
    modelBEnv: "DEEPSEEK_ANTHROPIC_MODEL",
    // 官方文档写的是不带 /v1；OpenAI SDK 会拼 /chat/completions
    defaultBaseA: "https://api.deepseek.com",
    defaultBaseB: "https://api.deepseek.com/anthropic",
    defaultModel: "deepseek-v4-flash",
  },
  qwen: {
    label: "千问 DashScope",
    keyEnv: "QWEN_API_KEY",
    baseAEnv: "QWEN_BASE_URL",
    baseBEnv: "QWEN_ANTHROPIC_BASE_URL",
    modelAEnv: "QWEN_MODEL",
    modelBEnv: "QWEN_ANTHROPIC_MODEL",
    // 国内百炼；协议 A 带 /compatible-mode/v1，协议 B 停在 /apps/anthropic（不要再加 /v1）
    defaultBaseA: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultBaseB: "https://dashscope.aliyuncs.com/apps/anthropic",
    defaultModel: "qwen-plus",
  },
  custom: {
    label: "自定义网关",
    keyEnv: "CUSTOM_API_KEY",
    baseAEnv: "CUSTOM_BASE_URL",
    baseBEnv: "CUSTOM_ANTHROPIC_BASE_URL",
    modelAEnv: "CUSTOM_MODEL",
    modelBEnv: "CUSTOM_ANTHROPIC_MODEL",
    // 协议 A 带 /v1（OpenAI SDK 会拼 /chat/completions）；协议 B 不带 /v1（Anthropic SDK 自己拼路径）
    defaultBaseA: "https://llm.goaichat.top/v1",
    defaultBaseB: "https://llm.goaichat.top",
    // 自定义网关没有「全仓库默认模型」，必须填 CUSTOM_MODEL 或顶层 LLM_MODEL
    defaultModel: "",
  },
};

// ── 顶层选用：日常只改这两行（外加可选的 B 协议 max_tokens）──
const selectorSchema = z.object({
  LLM_PROVIDER: z.enum(PROVIDER_IDS).default("minimax"),
  LLM_MODEL: z.string().optional(),
  LLM_ANTHROPIC_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
});

/** 生产线路（不含 custom）。思考 Demo 按家各建客户端，不跟顶层 LLM_PROVIDER。 */
export const PRODUCTION_PROVIDER_IDS = ["minimax", "zhipu", "deepseek", "qwen"] as const;
export type ProductionProviderId = (typeof PRODUCTION_PROVIDER_IDS)[number];

// 单次进程只建一套「当前选用」客户端。Demo 里 getLlm() 调多次不该 new 两次 SDK。
let cached: Llm | undefined;
/** 按提供商缓存：思考 Demo 要同时打三家，不能和 getLlm() 抢同一个单槽。 */
const cachedByProvider = new Map<ProviderId, Llm>();
let loadedEnv = false;

function envTrim(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/**
 * 把 CATALOG 里的变量名翻译成「当前这家」的 Key / URL / 默认模型。
 * URL 空则用目录默认值；模型 A 空则用目录 defaultModel；模型 B 空则跟 A 走。
 */
function resolveProvider(id: ProviderId): {
  apiKey: string;
  baseUrlA: string;
  baseUrlB: string;
  defaultModelA: string;
  defaultModelB: string;
  label: string;
} {
  const spec = CATALOG[id];
  const defaultModelA = envTrim(spec.modelAEnv) || spec.defaultModel;
  const defaultModelB = envTrim(spec.modelBEnv) || defaultModelA;
  return {
    label: spec.label,
    apiKey: envTrim(spec.keyEnv),
    baseUrlA: envTrim(spec.baseAEnv) || spec.defaultBaseA,
    baseUrlB: envTrim(spec.baseBEnv) || spec.defaultBaseB,
    defaultModelA,
    defaultModelB,
  };
}

/**
 * 真正组装 Llm。
 * requireKey=true  → 没 Key / 没模型 id 直接抛，启动失败要快（多数调 API 的 Demo）
 * requireKey=false → 没 Key 返回 null，让 mock 端点仍能起服务（Streaming / Rate-Limit）
 */
function buildLlm(requireKey: boolean): Llm | null {
  ensureEnvLoaded();

  const selector = selectorSchema.parse(process.env);
  const resolved = resolveProvider(selector.LLM_PROVIDER);
  // 顶层 LLM_MODEL 非空时，A/B 都用它——「我现在就想换一个模型 id」只改一行
  const override = selector.LLM_MODEL?.trim() ?? "";
  const modelA = override || resolved.defaultModelA;
  const modelB = override || resolved.defaultModelB;

  if (!resolved.apiKey) {
    if (!requireKey) {
      return null;
    }
    throw new Error(
      `apps/.env 未填 ${CATALOG[selector.LLM_PROVIDER].keyEnv}（当前 LLM_PROVIDER=${selector.LLM_PROVIDER}）`,
    );
  }
  if (!modelA) {
    throw new Error(
      `当前提供商 ${selector.LLM_PROVIDER} 没有模型 id：填 LLM_MODEL，或填 ${CATALOG[selector.LLM_PROVIDER].modelAEnv}`,
    );
  }

  return makeLlm(
    selector.LLM_PROVIDER,
    resolved,
    modelA,
    modelB || modelA,
    selector.LLM_ANTHROPIC_MAX_TOKENS,
  );
}

function makeLlm(
  id: ProviderId,
  resolved: ReturnType<typeof resolveProvider>,
  modelA: string,
  modelB: string,
  maxTokensB: number,
): Llm {
  return {
    provider: id,
    model: modelA,
    modelA,
    modelB,
    // 同 Key 只换 baseURL：这就是「一家提供商、两套协议」
    openai: new OpenAI({
      apiKey: resolved.apiKey,
      baseURL: resolved.baseUrlA,
    }),
    anthropic: new Anthropic({
      apiKey: resolved.apiKey,
      baseURL: resolved.baseUrlB,
    }),
    baseUrlA: resolved.baseUrlA,
    baseUrlB: resolved.baseUrlB,
    apiKey: resolved.apiKey,
    maxTokensB,
  };
}

function ensureEnvLoaded(): void {
  if (!loadedEnv) {
    loadRootEnv();
    loadedEnv = true;
  }
}

/** 目录里的显示名（MiniMax / 智谱 GLM / DeepSeek）。 */
export function getCatalogLabel(id: ProviderId): string {
  return CATALOG[id].label;
}

/**
 * 按提供商建客户端，**不**吃顶层 LLM_MODEL。
 * 思考 Demo 要同时打 MiniMax / 智谱 / DeepSeek / 千问，不能被 LLM_PROVIDER 拧成一家。
 * 没 Key / 没模型 id → null，不抛。
 */
export function getLlmForProvider(id: ProviderId): Llm | null {
  ensureEnvLoaded();
  const hit = cachedByProvider.get(id);
  if (hit) return hit;

  const selector = selectorSchema.parse(process.env);
  const resolved = resolveProvider(id);
  const modelA = resolved.defaultModelA;
  const modelB = resolved.defaultModelB || modelA;
  if (!resolved.apiKey || !modelA) return null;

  const llm = makeLlm(id, resolved, modelA, modelB, selector.LLM_ANTHROPIC_MAX_TOKENS);
  cachedByProvider.set(id, llm);
  return llm;
}

/** MiniMax / 智谱 / DeepSeek / 千问 里已经填了 Key 的，按目录顺序返回。 */
export function listProductionLlms(): Llm[] {
  const out: Llm[] = [];
  for (const id of PRODUCTION_PROVIDER_IDS) {
    const llm = getLlmForProvider(id);
    if (llm) out.push(llm);
  }
  return out;
}

/**
 * HTTP / CLI 进程真正 listen 之后再打。不要在 getLlm() 时打——那时服务还没起来。
 *
 * 用法（写新 server.ts 的 listen 回调里）：
 *   app.listen(PORT, "127.0.0.1", () => {
 *     console.log(`http://127.0.0.1:${PORT}/`);
 *     logLlmConfig(llm); // 或 logLlmConfig(getLlmOptional())
 *   });
 *
 * 不打印 apiKey。
 */
export function logLlmConfig(llm: Llm | null | undefined): void {
  if (!llm) {
    console.log("  LLM 配置    未就绪（当前 LLM_PROVIDER 没有 Key；mock 端点仍可用）");
    return;
  }
  const label = CATALOG[llm.provider].label;
  console.log("  LLM 配置");
  console.log(`    提供商    ${llm.provider}（${label}）`);
  console.log(`    协议 A    ${llm.modelA}    ${llm.baseUrlA}`);
  console.log(`    协议 B    ${llm.modelB}    ${llm.baseUrlB}`);
}

/** 会调真实 API 的 Demo 用这个。只认 openai / anthropic / model*，不要再读 MINIMAX_*。 */
export function getLlm(): Llm {
  if (!cached) {
    const llm = buildLlm(true);
    if (!llm) {
      throw new Error("getLlm: 内部错误，requireKey 仍得到 null");
    }
    cached = llm;
  }
  return cached;
}

/**
 * mock 为主、真 API 为可选的 Demo 用这个。
 * 没配当前提供商的 Key 时返回 null，HTTP 服务照样起；/api/real 自己判断 llm === null。
 */
export function getLlmOptional(): Llm | null {
  if (cached) {
    return cached;
  }
  const llm = buildLlm(false);
  if (llm) {
    cached = llm;
  }
  return llm;
}
