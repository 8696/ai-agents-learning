/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 * 数据流：process.env.PORT / getLlmOptional() → routes/health.ts 与 server 启动日志共用。
 * 为什么单独成文件：/health 与 listen 必须读同一个 PORT；/health 的 provider/model 来自 llm 单例。
 *
 * 端口口径 §5.3.3：max+1；本条 = 04-Tool-Gateway-幂等 · step-1 = 50034（apps/README 占用表已锁）。
 * 传 undefined 而不是空字符串，是为了让 z 的 default 生效（"" 会被 coerce 成 NaN）。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50034)
  .parse(process.env.PORT || undefined);