/**
 * 职责：解析本 Demo 的运行时端口。yarn 脚本 inline PORT=50159 是主端口源；这里只做兜底。
 */
import { z } from "zod-v4";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(50159),
});

export function parseRuntimeCtx(): { PORT: number } {
  return schema.parse(process.env);
}