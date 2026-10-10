/**
 * 职责：OpenAI json_schema 严格模式用的 Zod schema + 转换小帮手。
 * 数据流：zod schema → schemaToJsonSchema → OpenAI response_format.json_schema → 解析 LLM 返回 JSON。
 */
import { z } from "zod-v4";
import type { WorkerName } from "./types.js";

export const supervisorSchema = z.object({
  nextWorker: z.enum(["menu", "brew", "serve", "finish"]),
  reasoning: z.string().min(1),
});

export const finishSchema = z.object({
  guestReply: z.string().min(1),
  reasoning: z.string().min(1),
});

export const workerSchemas: Record<Exclude<WorkerName, "finish">, z.ZodType<{ patch: Record<string, unknown>; reasoning: string }>> = {
  menu: z.object({
    patch: z.object({
      menuNotes: z.string().min(1),
      drinkType: z.enum(["hot", "ice"]),
    }),
    reasoning: z.string().min(1),
  }),
  brew: z.object({
    patch: z.object({
      cupLabel: z.string().min(1),
    }),
    reasoning: z.string().min(1),
  }),
  serve: z.object({
    patch: z.object({
      pickupCall: z.string().min(1),
    }),
    reasoning: z.string().min(1),
  }),
};

export function schemaToJsonSchema(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema);
}
