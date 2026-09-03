/**
 * 职责：本条共用的 Intent 契约 —— Zod 一份、喂给 OpenAI strict 的 JSON Schema 一份、
 *   故意写坏的 schema 一份。
 * 数据流：Zod 校验模型吐回来的对象；JSON Schema 放进 response_format.json_schema；
 *   BAD_STRICT_SCHEMA 只给 /api/strict-rejected 用。
 * 为什么单独成文件：两套闸（json_object / json_schema）对照的必须是同一份字段。
 *   契约散在两个 flow 里，enum 或 required 迟早漂移，对照就没意义。
 *
 * 同一份契约手写两份，目的是不引 zod-to-json-schema 依赖。
 * 生产代码里应 `zodToJsonSchema(IntentZod, "Intent")` 自动派生。
 */
import { z } from "zod";

export const IntentZod = z.object({
  action: z.enum(["search", "order", "cancel"]),
  query: z.string().min(1),
  qty: z.number().int().positive().optional(),
});

export type Intent = z.infer<typeof IntentZod>;

/** 喂给 OpenAI strict：必须 additionalProperties:false，禁止 anyOf。 */
export const IntentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action", "query"],
  properties: {
    action: { type: "string", enum: ["search", "order", "cancel"] },
    query: { type: "string", minLength: 1 },
    qty: { type: "integer", minimum: 1 },
  },
} as const;

/**
 * 故意违反 OpenAI strict 白名单：缺 additionalProperties:false + 含 anyOf。
 * 真 token-mask 的网关会在 API 入口 400；只做软约束的网关可能 silent accept。
 */
export const BAD_STRICT_SCHEMA = {
  type: "object",
  properties: {
    foo: { type: "string" },
    bar: { anyOf: [{ type: "string" }, { type: "number" }] },
  },
  required: ["foo"],
} as const;

export const EXPECTED_KEYS = ["action", "query"] as const;
export const ALLOWED_KEYS = ["action", "query", "qty"] as const;
