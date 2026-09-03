/**
 * 职责：本 Demo 的运行时单例（PORT + 可选 LLM）。
 * 数据流：process.env.PORT / getLlmOptional() → 各 route 与 server 启动日志共用。
 * 为什么单独成文件：三个业务端点必须读同一个 PORT、同一个 llm。
 *   本份是 §5.3.13 协议 B 分拆，端口按占用表顺序分配。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

// getLlmOptional（不是 getLlm）：没配 Key 也要能起服务。
// 页面靠 /health 的 hasKey 提前把按钮 disabled，比点完再等 503 早（§5.3.9）。
export const llm = getLlmOptional();

// 端口口径 §5.3.3：顺序分配（占用表当前最大 + 1）。
export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50016)
  .parse(process.env.PORT || undefined);
