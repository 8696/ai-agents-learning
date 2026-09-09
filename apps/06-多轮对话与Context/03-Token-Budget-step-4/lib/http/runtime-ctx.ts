/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 *
 * 端口口径 §5.3.3：占用表当前最大 50047（03-Token-Budget-step-3），
 *   新 demo = 50048。同一组 demo 的 step-4。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50048)
  .parse(process.env.PORT || undefined);
