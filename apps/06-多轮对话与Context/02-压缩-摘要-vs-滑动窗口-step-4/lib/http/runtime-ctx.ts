/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 *
 * 本 demo 真调 LLM（默认 4 次：完整 + 滑动 + 摘要 + 摘要后问答；模拟失败模式 3 次：完整 + 滑动 + fallback）。
 * 端口口径 §5.3.3：占用表当前最大 50042（step-3），新 demo = 50043。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50043)
  .parse(process.env.PORT || undefined);
