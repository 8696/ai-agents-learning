/**
 * 职责：Zod → JSON Schema（手写简化版，覆盖本 Demo 用到的类型）。
 * 数据流：ToolDef.input → OpenAI tools[].function.parameters / 前端展示。
 * 为什么不引包：教学 Demo 不为这一处拉 zod-to-json-schema 依赖。
 */
import { z } from "zod";

type ZodDef = {
  typeName?: string;
  innerType?: z.ZodType;
  checks?: unknown[];
  shape?: () => Record<string, z.ZodType>;
};

export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const _def = (schema as { _def?: ZodDef })._def;
  if (!_def) return {};
  const tn = _def.typeName;

  // .optional() 只剥壳，默认字段仍 required
  if (tn === "ZodOptional") return zodToJsonSchema(_def.innerType as z.ZodType);

  if (tn === "ZodString") {
    const out: Record<string, unknown> = { type: "string" };
    for (const c of (_def.checks ?? []) as Array<{
      kind: string;
      value?: number;
      regex?: { source: string };
    }>) {
      if (c.kind === "min") out.minLength = c.value;
      if (c.kind === "max") out.maxLength = c.value;
      if (c.kind === "regex") out.pattern = c.regex?.source;
    }
    return out;
  }

  if (tn === "ZodNumber") {
    const out: Record<string, unknown> = { type: "number" };
    for (const c of (_def.checks ?? []) as Array<{ kind: string; value?: number }>) {
      if (c.kind === "min") out.minimum = c.value;
      if (c.kind === "max") out.maximum = c.value;
      if (c.kind === "int") out.type = "integer";
    }
    return out;
  }

  if (tn === "ZodObject") {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    const shape = _def.shape!();
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      const inner = (value as { _def?: { typeName?: string } })._def;
      if (inner?.typeName !== "ZodOptional") required.push(key);
    }
    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  }

  return { type: "string" };
}
