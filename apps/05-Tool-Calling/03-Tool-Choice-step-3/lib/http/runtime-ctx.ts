/**
 * 职责：运行时上下文。端口默认 50033。
 */
import { z } from "zod";
import { getLlmOptional, type Llm } from "../../../../llm.js";

export const PORT = z.coerce.number().default(50033).parse(process.env.PORT);

export type RuntimeCtx = { port: number; llm: Llm | null };

export function getRuntimeCtx(): RuntimeCtx {
  return { port: PORT, llm: getLlmOptional() };
}
