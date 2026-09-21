/**
 * 职责：解析本 Demo 的运行时端口。yarn 脚本 inline PORT=50141 是主端口源；这里只做兜底。
 *
 * 数据流：process.env.PORT → zod coerce → 数字。未设时 default(50141)。
 */
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(50141),
});

export function parseRuntimeCtx(): { PORT: number } {
  return schema.parse(process.env);
}