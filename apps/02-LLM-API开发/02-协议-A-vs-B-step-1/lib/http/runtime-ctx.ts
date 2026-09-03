/**
 * 职责：本 Demo 运行时单例 —— PORT + 可选 LLM（没 Key 时为 null）。
 * 数据流：apps/.env → getLlmOptional() → routes / protocol-* 共用同一份客户端。
 * 为什么单独成文件：改端口口径只动这里；getLlm() 会在没 Key 时抛，服务就起不来。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

/** 模块 02 第 02 条 → 50202（§5.3.3 `5{MM}{SS}`）。 */
export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50202)
  .parse(process.env.PORT ?? undefined);
