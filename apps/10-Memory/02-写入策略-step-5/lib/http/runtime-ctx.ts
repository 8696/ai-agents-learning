/**
 * 职责：本 Demo 的默认端口与启动上下文。
 * 数据流：yarn 脚本 inline PORT=50108 优先；缺省时 .default(50108) 兜底。
 * /health 与 listen 读同一个 PORT。禁止把 PORT 写进共享 apps/.env。
 */
import { z } from "zod";

export const PORT = z.coerce.number().default(50108).parse(process.env.PORT);
