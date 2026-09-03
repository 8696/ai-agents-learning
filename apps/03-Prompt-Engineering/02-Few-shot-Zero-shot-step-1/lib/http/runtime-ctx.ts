/**
 * 职责：本 Demo 的运行时单例 —— 监听端口 + 可选 LLM 客户端。
 * 数据流：process.env.PORT / getLlmOptional() → routes/*（/health 与 /api/classify）+ server.ts 启动日志。
 * 为什么单独成文件：health 与 classify 读的必须是同一个 PORT、同一个 llm。
 *   各自 parse 一次会出现「/health 报的端口和真正 listen 的端口不一样」。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

// getLlmOptional（不是 getLlm）：没配 Key 也要能起服务。
// 页面靠 /health 的 hasKey 提前把按钮 disabled 掉，比让人点完再等 503 早得多（§5.3.9）。
export const llm = getLlmOptional();

// 端口口径 §5.3.3：顺序分配（占用表当前最大 + 1）。
export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50012)
  .parse(process.env.PORT || undefined);
