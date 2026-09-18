/**
 * 职责：本演示的默认端口（PORT）与启动环境。
 * 数据流：yarn 脚本 inline PORT=50127 → process.env.PORT → 本文件 .default(50127) 兜底 → /health 与 listen 共用。
 * 为什么单独成文件：禁止把端口写在 server.ts 里再 parse 一次。
 */
import { z } from "zod";
import { loadRootEnv } from "../../../../load-root-env.js";

loadRootEnv();

export const PORT = z.coerce.number().int().positive().default(50127).parse(process.env.PORT);
