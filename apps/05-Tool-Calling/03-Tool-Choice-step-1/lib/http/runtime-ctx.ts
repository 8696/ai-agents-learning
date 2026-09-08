/**
 * 职责：本 Demo 的运行时上下文（端口 + 可选 LLM 句柄）。
 * 数据流：process.env.PORT → Zod default(50031) → server listen + /health 同口。
 */
import { z } from "zod";
import { getLlmOptional, type Llm } from "../../../../llm.js";

export const PORT = z.coerce.number().default(50031).parse(process.env.PORT);

export type RuntimeCtx = {
  port: number;
  llm: Llm | null;
};

export function getRuntimeCtx(): RuntimeCtx {
  return { port: PORT, llm: getLlmOptional() };
}
