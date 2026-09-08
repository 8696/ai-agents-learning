/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 * 数据流：process.env.PORT / getLlmOptional() → routes/health.ts 与 server 启动日志共用。
 * 为什么单独成文件：/health 与 listen 必须读同一个 PORT；/health 的 provider/model 来自 llm 单例。
 *
 * 端口口径 §5.3.3：step-3 = 50036。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50036)
  .parse(process.env.PORT || undefined);