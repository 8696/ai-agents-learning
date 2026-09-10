/**
 * 职责：本 Demo 的运行时单例（PORT + LLM 客户端）。
 * 数据流：process.env.PORT / getLlmOptional() → routes/health.ts 与 server 启动日志共用。
 * 为什么单独成文件：/health 与 listen 必须读同一个 PORT；/health 的 provider/model 来自 llm 单例。
 *
 * step-3 真调 LLM（B 路径规划器 + 重规划都调真模型，A 路径继续真模型循环）：
 *   - callsModel: true
 *   - 缺 Key 时主按钮 disabled；/health 的 hasKey=false → 页面把主按钮 disabled
 *   - 端口基线（2026-09-10）：占用表当前最大 50054（07-02 step-2），
 *     新 demo = 50055。step-3 跟 step-2 是兄弟，各占一个口（§5.3.3 撞车继续 +1）。
 *   - yarn script 命令 inline PORT=50055（§5.3.3 端口主源）；本 .default() 是兜底。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50055)
  .parse(process.env.PORT || undefined);
