/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 * 数据流：process.env.PORT / getLlmOptional() → 各 route / server 启动日志 / CLI 共用。
 * 为什么单独成文件：避免每个 route 各自 parse 一次 env，改端口口径只动这里。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

/** mock 不需要 Key；真 API 页 / /api/real* 才读这个。没有 Key 时是 null，不要抛。 */
export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50204)
  .parse(process.env.PORT ?? undefined);
