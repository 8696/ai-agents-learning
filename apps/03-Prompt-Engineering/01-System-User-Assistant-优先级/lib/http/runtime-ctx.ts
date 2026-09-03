/**
 * 职责：本 Demo 运行时单例 —— PORT + 可选 LLM（没 Key 时为 null）。
 * 数据流：process.env.PORT / getLlmOptional() → routes 与 server 启动日志共用。
 * 为什么单独成文件：/health 报的端口必须和 listen 的是同一个数。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

/** §5.3.3：模块 03 第 01 条 → 50301。PORT= 只做单次覆盖，不写进 apps/.env。 */
export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50301)
  .parse(process.env.PORT ?? undefined);
