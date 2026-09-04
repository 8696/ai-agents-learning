/**
 * 职责：本条唯一契约 —— Zod Intent + 手写 JSON Schema + issues→repair 文本 + transform。
 * 数据流：未知 JSON → parse / safeParse / transform；schema literal 给 /health 展示。
 * 为什么手写 JSON Schema：本条要看「喂给 SDK 的那份长什么样」，不引 zod-to-json-schema。
 */
import { z } from "zod";
import { logger } from "../logger.js";

export const Intent = z.object({
  action: z.enum(["search", "order", "cancel"]).default("search"),
  query: z.string().min(1),
  qty: z.number().int().positive().optional(),
});

export const Enriched = Intent.transform((o) => ({
  ...o,
  repaired: true,
  when: new Date().toISOString(),
}));

export const intentJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $ref: "#/$defs/Intent",
  $defs: {
    Intent: {
      type: "object",
      required: ["query"],
      properties: {
        action: {
          type: "string",
          enum: ["search", "order", "cancel"],
          default: "search",
        },
        query: { type: "string", minLength: 1 },
        qty: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
  },
} as const;

export const SAMPLE_OK = { action: "order", query: "奶茶", qty: 2 } as const;
export const SAMPLE_BAD = { action: "BLOW_UP", query: "" } as const;
export const SAMPLE_TRANSFORM = { query: "咖啡" } as const;

export type IssueRow = { path: string; code: string; message: string };

export function issuesOf(error: z.ZodError): IssueRow[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    code: issue.code,
    message: issue.message,
  }));
}

export function repairPromptOf(error: z.ZodError): string {
  const prompt =
    "上一次的输出不符合 schema，错误：\n" +
    error.issues
      .map((i) => `  - ${(i.path as (string | number)[]).join(".") || "(root)"}: ${i.message}`)
      .join("\n") +
    "\n请重新输出合法 JSON。";
  // issues → repair 文本：本条核心是把「校验失败」翻译成「喂回模型的提示」；
  // 拼好之后整段打出来（含每条 issue 的 path / message），便于核对喂回去的指令是否清楚。
  logger.info(
    "schema.repair.prompt",
    "→ 拼出 repair 提示",
    "把 Zod issues 翻成人话喂回模型；记 prompt 让排错时看清喂回去的指令",
    { issuesCount: error.issues.length, prompt, __code: "export function repairPromptOf(error: z.ZodError): string { ... }" },
  );
  return prompt;
}

export function runParse(payload: unknown) {
  logger.debug(
    "schema.validate",
    "→ Intent.safeParse(payload)",
    "parse 入口：同份 payload 走 parse + safeParse 两条；先记原始 payload 形状便于复现 bad case",
    { payloadType: typeof payload, payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : null },
  );
  const safe = Intent.safeParse(payload);
  if (safe.success) {
    logger.info(
      "schema.validate",
      "← Intent.safeParse 通过",
      "payload 符合 schema（query 非空 / action 枚举 / 数字正整数）；记 data 字段核对 default 是否生效（action 应是 search）",
      { value: safe.data, __code: "const safe = Intent.safeParse(payload)" },
    );
    return {
      parseOk: true as const,
      value: safe.data,
      safeParse: { success: true as const, data: safe.data },
    };
  }
  logger.warn(
    "schema.validate",
    "← Intent.safeParse 失败",
    "payload 不符 schema；走 /api/repair 路径，issues 已收集好可拼 repair prompt",
    { errorMessage: safe.error.message, issuesCount: safe.error.issues.length },
  );
  logger.warn(
    "zod.fail",
    "Intent 校验失败 issues",
    "详列每条 issue 的 path/code/message；这是给 round-2 模型看、给前端看、给排错者看的统一信号源",
    { issues: issuesOf(safe.error), __code: "issuesOf(safe.error)" },
  );
  return {
    parseOk: false as const,
    parseError: safe.error.message,
    safeParse: {
      success: false as const,
      issues: issuesOf(safe.error),
    },
  };
}

export function runRepair(payload: unknown) {
  logger.debug(
    "schema.validate",
    "→ Intent.safeParse(payload)（repair 入口）",
    "repair 入口：先跑一遍校验拿 issues 再拼 repair prompt；如果直接通过就不拼、记 note 提醒换 SAMPLE_BAD 再试",
    { payloadType: typeof payload, payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : null },
  );
  const safe = Intent.safeParse(payload);
  if (safe.success) {
    logger.info(
      "schema.validate",
      "← repair 入口直接通过",
      "payload 已经合法；不拼 repair、记 note 让前端知道要换 SAMPLE_BAD 才有 issues 可拼",
      { data: safe.data },
    );
    return {
      success: true as const,
      data: safe.data,
      note: "这份 payload 已经合法，没有 issues 可拼 repair。换 SAMPLE_BAD 再试。",
    };
  }
  logger.warn(
    "zod.fail",
    "repair 入口 Intent 校验失败 issues",
    "详列每条 issue 的 path/code/message；这些就是 repair prompt 要喂回去的内容",
    { issues: issuesOf(safe.error) },
  );
  return {
    success: false as const,
    issues: issuesOf(safe.error),
    repairPrompt: repairPromptOf(safe.error),
  };
}

export function runTransform(payload: unknown) {
  logger.debug(
    "schema.transform",
    "→ Enriched.parse(payload)",
    "transform 入口：先 Intent 校验（补 action default），再加 repaired / when；记 payload 形状便于复现",
    { payloadType: typeof payload, payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : null },
  );
  const enriched = Enriched.parse(payload);
  logger.info(
    "schema.transform",
    "← Enriched.parse 通过",
    "transform 成功：对比原 payload 看多了哪些字段（repaired: true / when: ISO 时间戳）；记原 vs 增便于核对 schema 改结构的能力",
    { enriched, __code: "const enriched = Enriched.parse(payload)" },
  );
  return enriched;
}
