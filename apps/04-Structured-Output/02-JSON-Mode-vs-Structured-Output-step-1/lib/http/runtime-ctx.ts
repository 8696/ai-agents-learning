/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 * 数据流：process.env.PORT / getLlmOptional() → 各 route 与 server 启动日志共用。
 * 为什么单独成文件：三个业务端点必须读同一个 PORT、同一个 llm。
 *   各自 parse 一次会出现「/health 报的端口和真正 listen 的端口不一样」。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

// getLlmOptional（不是 getLlm）：没配 Key 也要能起服务。
// 页面靠 /health 的 hasKey 提前把按钮 disabled，比点完再等 503 早（§5.3.9）。
export const llm = getLlmOptional();

// 端口口径 §5.3.3：5{模块两位}{小节两位} = 5 04 02。
// 传 undefined 而不是空字符串，是为了让 z 的 default 生效（"" 会被 coerce 成 NaN）。
export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50402)
  .parse(process.env.PORT || undefined);
