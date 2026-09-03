/**
 * 职责：本 Demo 运行时单例 —— PORT + 当前 LLM（没 Key 时为 null）。
 * 数据流：apps/.env → getLlmOptional → routes / protocol-* 共用同一份客户端。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

/** 同小节第二份 HTTP Demo：小节位 +10 → 50213（§5.3.3）。 */
export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50213)
  .parse(process.env.PORT ?? undefined);
