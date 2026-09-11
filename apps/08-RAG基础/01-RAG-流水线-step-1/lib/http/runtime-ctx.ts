/**
 * 职责：本 Demo 默认端口。yarn 脚本 inline PORT 优先；这里只兜底。
 */
import { z } from "zod";

export const PORT = z.coerce.number().int().positive().default(50067).parse(process.env.PORT);
