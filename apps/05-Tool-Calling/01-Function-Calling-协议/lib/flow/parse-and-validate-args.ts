/**
 * 职责：解析 + 校验单个 tool_call.arguments（JSON.parse → Zod）。
 * 数据流：arguments 字符串 → { ok, data } 或 { ok:false, errorContent, rawArgs }。
 * 同文件两个小函数：步骤相邻，拆成两个文件反而难跟读。
 */
import type { z } from "zod";

export type ParseArgsOk = { ok: true; data: unknown; rawArgs: unknown };
export type ParseArgsFail = {
  ok: false;
  errorContent: string;
  rawArgs: unknown;
  parseOk: false;
};

/** ① 模型给的 arguments 必须是合法 JSON 对象字符串。 */
export function parseToolArgsJson(argumentsJson: string): ParseArgsOk | ParseArgsFail {
  try {
    const rawArgs = JSON.parse(argumentsJson) as unknown;
    return { ok: true, data: rawArgs, rawArgs };
  } catch (e) {
    return {
      ok: false,
      errorContent: `arguments 不是合法 JSON: ${(e as Error).message}`,
      rawArgs: argumentsJson,
      parseOk: false,
    };
  }
}

/** ② 与 Tool 注册时的 Zod schema 对齐；失败时 issues 写成给人/模型读的一句话。 */
export function validateToolArgs(
  schema: z.ZodType,
  args: unknown,
): { ok: true; data: unknown } | { ok: false; errorContent: string } {
  const parsed = schema.safeParse(args);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errMsg = parsed.error.issues
    .map((i) => `${(i.path as (string | number)[]).join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, errorContent: `参数错误: ${errMsg}` };
}
