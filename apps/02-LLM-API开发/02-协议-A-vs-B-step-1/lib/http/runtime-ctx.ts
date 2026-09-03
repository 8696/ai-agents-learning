/**
 * 职责：本 Demo 运行时单例 —— PORT + 可选 LLM（没 Key 时为 null）。
 * 数据流：apps/.env → getLlmOptional() → routes / protocol-* 共用同一份客户端。
 * 为什么单独成文件：改端口口径只动这里；getLlm() 会在没 Key 时抛，服务就起不来。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

/** 顺序分配（§5.3.3）。 */
export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50006)
  .parse(process.env.PORT ?? undefined);
