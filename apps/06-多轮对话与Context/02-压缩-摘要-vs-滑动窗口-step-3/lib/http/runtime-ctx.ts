/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 *
 * 本 demo 真调 LLM 4 次（每次「跑三方对照」按钮：完整 + 滑动窗口 + 摘要 + 摘要后问答），
 *   用 getLlmOptional 让缺 Key 时服务仍能起，/health 的 hasKey=false → 页面把主按钮 disabled。
 *
 * 端口口径 §5.3.3：占用表当前最大 50041（step-2），新 demo = 50042。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50042)
  .parse(process.env.PORT || undefined);
