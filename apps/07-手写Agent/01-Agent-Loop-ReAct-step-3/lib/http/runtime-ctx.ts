/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 * 数据流：process.env.PORT / getLlmOptional() → routes/health.ts 与 server 启动日志共用。
 * 为什么单独成文件：/health 与 listen 必须读同一个 PORT；/health 的 provider/model 来自 llm 单例。
 *
 * step-1 真调 LLM（每次点「跑 Agent」按钮一次 Agent Loop），用 getLlmOptional 让缺 Key 时服务仍能起，
 *   /health 的 hasKey=false → 页面把主按钮 disabled。
 *   真正调 LLM 的路由（routes/agent.ts）单独 try/catch getLlm() 抛错，给前端回 502。
 *
 * 端口基线（2026-09-10）：占用表当前最大 50048（06-03-token-budget-step-4），
 * 新 demo = 50049。模块 07 第一份 HTTP Demo，从 50049 起步。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50051)
  .parse(process.env.PORT || undefined);
