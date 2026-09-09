/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 * 数据流：process.env.PORT / getLlmOptional() → routes/health.ts 与 server 启动日志共用。
 * 为什么单独成文件：/health 与 listen 必须读同一个 PORT；/health 的 provider/model 来自 llm 单例。
 *
 * 本 demo 真调 LLM（每次点「跑对比」3 次：完整 #1 + 摘要 #2 + 摘要后问答 #3），
 *   用 getLlmOptional 让缺 Key 时服务仍能起，/health 的 hasKey=false → 页面把主按钮 disabled。
 *   真正调 LLM 的路由（routes/summarize.ts）单独 try/catch getLlm() 抛错，给前端回 502。
 *
 * 端口口径 §5.3.3：占用表当前最大 50040（step-1），新 demo = 50041。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50041)
  .parse(process.env.PORT || undefined);
