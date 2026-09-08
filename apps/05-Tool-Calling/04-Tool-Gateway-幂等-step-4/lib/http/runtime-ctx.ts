/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 * 端口口径 §5.3.3：step-4 = 50037。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50037)
  .parse(process.env.PORT || undefined);