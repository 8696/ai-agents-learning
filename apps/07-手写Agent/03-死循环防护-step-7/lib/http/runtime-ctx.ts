/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 * 数据流：process.env.PORT / getLlmOptional() → routes/health.ts 与 server 启动日志共用。
 * 为什么单独成文件：/health 与 listen 必须读同一个 PORT。
 *
 * step-3 走 §5.3.0 默认调真模型：model_stop / triple 闸真调模型看 finish_reason。
 * /health 加 callsModel: true；页脚提示「会调真模型」。
 * 端口基线（2026-09-10）：step-2 用 50060，step-3 = max+1 = 50061。
 * yarn script 命令 inline PORT=50061（§5.3.3 端口主源）；本 .default() 是兜底。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50065)
  .parse(process.env.PORT || undefined);