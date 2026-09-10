/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 * 数据流：process.env.PORT / getLlmOptional() → routes/health.ts 与 server 启动日志共用。
 * 为什么单独成文件：/health 与 listen 必须读同一个 PORT。
 *
 * 本条走 §5.3.0 例外「纯协议形状 / UI 渲染层演示」：mock 模型 + mock 工具，不调真 LLM。
 *   - /health 加 callsModel: false，页脚写「本地计算 · 不调 LLM」
 *   - 端口基线（2026-09-10）：占用表当前最大 50058（07-02 step-6），新 demo = 50059。
 *   - yarn script 命令 inline PORT=50059（§5.3.3 端口主源）；本 .default() 是兜底。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50059)
  .parse(process.env.PORT || undefined);