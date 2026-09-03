/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 * 数据流：process.env.PORT / getLlmOptional() → routes/health.ts 与 server 启动日志共用。
 * 为什么单独成文件：/health 与 listen 必须读同一个 PORT；/health 的 provider/model 来自 llm 单例。
 *   各自 parse 一次会出现「" /health 报的端口和真正 listen 的端口不一样」。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

// getLlmOptional（不是 getLlm）：没配 Key 也能起服务。
// 页面靠 /health 的 hasKey 提前把按钮 disabled，比点完再等 502 早（§5.3.9）。
// step-2 真调 LLM，但 /health 仍用 optional 报告"有没有 Key"，让缺 Key 的服务也能起。
// 真正调 LLM 的路由（routes/chat.ts）单独 try/catch getLlm() 抛错，给前端回 502。
export const llm = getLlmOptional();

// 端口口径 §5.3.3：顺序分配（占用表当前最大 + 1）。
// 传 undefined 而不是空字符串，是为了让 z 的 default 生效（"" 会被 coerce 成 NaN）。
export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50018)
  .parse(process.env.PORT || undefined);