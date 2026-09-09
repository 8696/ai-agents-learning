/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 *
 * 本 demo 真调 LLM（4 次：完整 + 滑动窗口按 token + 摘要 + 摘要后问答）。
 * 端口口径 §5.3.3：占用表当前最大 50043（step-4），新 demo = 50044。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50044)
  .parse(process.env.PORT || undefined);
