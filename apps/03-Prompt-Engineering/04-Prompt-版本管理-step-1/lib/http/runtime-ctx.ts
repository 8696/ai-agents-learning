/**
 * 职责：本 Demo 的运行时单例 —— 监听端口 + 可选 LLM 客户端。
 * 数据流：process.env.PORT / getLlmOptional() → routes/* + server.ts 启动日志。
 * 为什么单独成文件：health 与 compare 必须读同一个 PORT、同一个 llm。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50304)
  .parse(process.env.PORT || undefined);
