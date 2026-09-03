/**
 * 职责：本 Demo 的运行时单例 —— 监听端口 + 可选 LLM 客户端。
 * 数据流：process.env.PORT / getLlmOptional() → routes/*（/health 与三个 SSE 端点）+ server.ts 启动日志。
 * 为什么单独成文件：三个 route 必须看到同一份 PORT 和同一份 llm。
 *   各自 parse 一次会出现「页脚说有 Key、发请求又说没 Key」这种自相矛盾。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

// getLlmOptional（不是 getLlm）：没配 Key 也要能起服务。
// 页面靠 /health 的 hasKey 提前把按钮 disabled 掉，比让人点完再等 503 早得多（§5.3.9）。
export const llm = getLlmOptional();

/** 本 Demo 只跑协议 A（OpenAI Chat Completions）。 */
export const PROTOCOL = "A" as const;

// 端口口径 §5.3.3：顺序分配（占用表当前最大 + 1）。
// 传 undefined 而不是空字符串，是为了让 z 的 default 生效（"" 会被 coerce 成 NaN）。
export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50008)
  .parse(process.env.PORT || undefined);
