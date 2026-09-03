/**
 * 职责：本 Demo 的运行时单例 —— 监听端口 + 可选 LLM 客户端（本条不调模型）。
 * 数据流：process.env.PORT / getLlmOptional() → routes/* + server.ts 启动日志。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50401)
  .parse(process.env.PORT || undefined);
