/**
 * 职责：本条唯一契约 —— Zod Intent + 手写 JSON Schema + issues→repair 文本 + transform。
 * 数据流：未知 JSON → parse / safeParse / transform；schema literal 给 /health 展示。
 * 为什么手写 JSON Schema：本条要看「喂给 SDK 的那份长什么样」，不引 zod-to-json-schema。
 *
 * 日志（§5.3.16）：普通函数——五条日志（含 __code）仍要；本条不调 LLM，按 Zod 的 success / failure 走两条日志路径。
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
  const t0 = Date.now();
  const prompt =
    "上一次的输出不符合 schema，错误：\n" +
    error.issues
      .map((i) => `  - ${(i.path as (string | number)[]).join(".") || "(root)"}: ${i.message}`)
      .join("\n") +
    "\n请重新输出合法 JSON。";
  // issues → repair 文本：本条核心是把「校验失败」翻译成「喂回模型的提示」；
  // 拼好之后整段写出来（含每条 issue 的 path / message），便于核对喂回去的指令是否清楚。
  logger.info(
    "│ 契约-repairPromptOf",
    "调用函数结束：repairPromptOf",
    "为什么写这条日志：把 Zod issues 翻成人话喂回模型；记 prompt 让排错时看清喂回去的指令。",
    {
      返回值: { issuesCount: error.issues.length, prompt },
      __code: "export function repairPromptOf(error: z.ZodError): string { ... }",
      耗时ms: Date.now() - t0,
    },
  );
  return prompt;
}

export function runParse(payload: unknown) {
  const t0 = Date.now();
  logger.info(
    "│ 契约-runParse",
    "调用函数开始：runParse",
    "为什么写这条日志：route 只认这一层返回的 { parseOk, value, safeParse }；本条不调 LLM，只是 Zod 校验。当前：同份 payload 走 parse + safeParse 两条；先记原始 payload 形状便于复现 bad case。",
    {
      入参: { payloadType: typeof payload, payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : null },
      __code: "const safe = Intent.safeParse(payload);",
    },
  );

  const safe = Intent.safeParse(payload);
  if (safe.success) {
    logger.info(
      "│ 契约-runParse",
      "调用函数结束：runParse",
      "为什么写这条日志：payload 符合 schema（query 非空 / action 枚举 / 数字正整数）；记 data 字段核对 default 是否生效（action 应是 search）。",
      {
        返回值: {
          parseOk: true,
          value: safe.data,
          safeParse: { success: true, data: safe.data },
        },
        __code: "const safe = Intent.safeParse(payload)",
        耗时ms: Date.now() - t0,
      },
    );
    return {
      parseOk: true as const,
      value: safe.data,
      safeParse: { success: true as const, data: safe.data },
    };
  }
  logger.warn(
    "│ 契约-runParse",
    "调用函数结束：runParse（失败）",
    "为什么写这条日志：payload 不符 schema；走 /api/repair 路径，issues 已收集好可拼 repair prompt。warn 是「业务失败但能走通」的等级。",
    {
      返回值: {
        parseOk: false,
        parseError: safe.error.message,
        safeParse: { success: false, issues: issuesOf(safe.error) },
      },
      issuesCount: safe.error.issues.length,
      耗时ms: Date.now() - t0,
    },
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
  const t0 = Date.now();
  logger.info(
    "│ 契约-runRepair",
    "调用函数开始：runRepair",
    "为什么写这条日志：route 只认这一层返回的 { success, data/issues, repairPrompt }；本条不调 LLM，只是把 issues 拼成可喂回模型的修复提示。当前：先跑一遍校验拿 issues 再拼 repair prompt。",
    {
      入参: { payloadType: typeof payload, payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : null },
      __code: "const safe = Intent.safeParse(payload);",
    },
  );

  const safe = Intent.safeParse(payload);
  if (safe.success) {
    logger.info(
      "│ 契约-runRepair",
      "调用函数结束：runRepair",
      "为什么写这条日志：payload 已经合法；不拼 repair、记 note 让前端知道要换 SAMPLE_BAD 才有 issues 可拼。",
      {
        返回值: { success: true, data: safe.data, note: "这份 payload 已经合法，没有 issues 可拼 repair。换 SAMPLE_BAD 再试。" },
        耗时ms: Date.now() - t0,
      },
    );
    return {
      success: true as const,
      data: safe.data,
      note: "这份 payload 已经合法，没有 issues 可拼 repair。换 SAMPLE_BAD 再试。",
    };
  }
  logger.warn(
    "│ 契约-runRepair",
    "调用函数结束：runRepair（失败）",
    "为什么写这条日志：详列每条 issue 的 path/code/message；这些就是 repair prompt 要喂回去的内容。",
    {
      返回值: {
        success: false,
        issues: issuesOf(safe.error),
        repairPrompt: repairPromptOf(safe.error),
      },
      issuesCount: safe.error.issues.length,
      耗时ms: Date.now() - t0,
    },
  );
  return {
    success: false as const,
    issues: issuesOf(safe.error),
    repairPrompt: repairPromptOf(safe.error),
  };
}

export function runTransform(payload: unknown) {
  const t0 = Date.now();
  logger.info(
    "│ 契约-runTransform",
    "调用函数开始：runTransform",
    "为什么写这条日志：route 只认这一层返回的 Enriched 对象；本条不调 LLM，是 Zod.transform 的演示。当前：先 Intent 校验（补 action default），再加 repaired / when。",
    {
      入参: { payloadType: typeof payload, payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : null },
      __code: "const enriched = Enriched.parse(payload);",
    },
  );

  const enriched = Enriched.parse(payload);
  logger.info(
    "│ 契约-runTransform",
    "调用函数结束：runTransform",
    "为什么写这条日志：transform 成功——对比原 payload 看多了哪些字段（repaired: true / when: ISO 时间戳）；记原 vs 增便于核对 schema 改结构的能力。",
    {
      返回值: { enriched },
      __code: "const enriched = Enriched.parse(payload)",
      耗时ms: Date.now() - t0,
    },
  );
  return enriched;
}