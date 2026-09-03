/**
 * 职责：本条唯一契约 —— Zod Intent + 手写 JSON Schema + issues→repair 文本 + transform。
 * 数据流：未知 JSON → parse / safeParse / transform；schema literal 给 /health 展示。
 * 为什么手写 JSON Schema：本条要看「喂给 SDK 的那份长什么样」，不引 zod-to-json-schema。
 */
import { z } from "zod";

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
  return (
    "上一次的输出不符合 schema，错误：\n" +
    error.issues
      .map((i) => `  - ${(i.path as (string | number)[]).join(".") || "(root)"}: ${i.message}`)
      .join("\n") +
    "\n请重新输出合法 JSON。"
  );
}

export function runParse(payload: unknown) {
  const safe = Intent.safeParse(payload);
  if (safe.success) {
    return {
      parseOk: true as const,
      value: safe.data,
      safeParse: { success: true as const, data: safe.data },
    };
  }
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
  const safe = Intent.safeParse(payload);
  if (safe.success) {
    return {
      success: true as const,
      data: safe.data,
      note: "这份 payload 已经合法，没有 issues 可拼 repair。换 SAMPLE_BAD 再试。",
    };
  }
  return {
    success: false as const,
    issues: issuesOf(safe.error),
    repairPrompt: repairPromptOf(safe.error),
  };
}

export function runTransform(payload: unknown) {
  return Enriched.parse(payload);
}
