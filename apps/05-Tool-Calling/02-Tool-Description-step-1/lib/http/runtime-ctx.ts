/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 * 数据流：process.env.PORT / getLlmOptional() → routes/health.ts 与 server 启动日志共用。
 * 为什么单独成文件：/health 与 listen 必须读同一个 PORT；/health 的 provider/model 来自 llm 单例。
 *   各自 parse 一次会出现「/health 报的端口和真正 listen 的端口不一样」。
 *
 * 本条特点：本 Demo 真调 LLM（两次 = 对照 A/B），用 getLlmOptional 而非 getLlm，让缺 Key 时服务仍能起，
 *   /health 的 hasKey=false → 页面把主按钮 disabled，省得用户点了再 502。
 *   真正调 LLM 的路由（routes/compare.ts）单独 try/catch getLlm() 抛错，给前端回 502。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

// 端口口径 §5.3.3：max(占用表所有端口) + 1。占用表当前最大 50024（01-step-8），
// 新 demo = 50025。§5.3.14 的「5{模块两位}{小节两位 + 10×(N-1)}」是撞车备用公式，不是默认；
// 顺序 max+1 才是常规（01 那 8 步 50017→50024 即此口径）。
// 传 undefined 而不是空字符串，是为了让 z 的 default 生效（"" 会被 coerce 成 NaN）。
export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50025)
  .parse(process.env.PORT || undefined);
