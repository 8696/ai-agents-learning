/**
 * 职责：本 Demo 的运行时上下文 —— 默认端口从 PORT 环境变量读，没读就用兜底 50080。
 * 数据流：server.ts 读 → /health 回写 → 页脚 #env-info 渲染。
 *
 * 为什么单独成文件：端口「主源」在 apps/package.json 的脚本里 inline（PORT=50080 tsx …），
 * 这是兜底 —— 单次 `PORT=31001 npx tsx …` 也能正常跑。
 */
import { z } from "zod";

export const runtimeSchema = z.object({
  port: z.coerce.number().int().positive().default(50084),
});

export const runtime = runtimeSchema.parse({
  port: process.env.PORT,
});