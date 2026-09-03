/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 * 数据流：process.env.PORT / getLlmOptional() → 各 route 与 server 启动日志共用。
 * 为什么单独成文件：三个业务端点必须读同一个 PORT、同一个 llm。
 *   本份是 §5.3.13 协议 B 分拆，端口按小节两位 +10 = 50412。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

// getLlmOptional（不是 getLlm）：没配 Key 也要能起服务。
// 页面靠 /health 的 hasKey 提前把按钮 disabled，比点完再等 503 早（§5.3.9）。
export const llm = getLlmOptional();

// 端口口径 §5.3.3：同一小节第二份 HTTP Demo，小节两位 +10 → 5 04 12。
export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50412)
  .parse(process.env.PORT || undefined);
