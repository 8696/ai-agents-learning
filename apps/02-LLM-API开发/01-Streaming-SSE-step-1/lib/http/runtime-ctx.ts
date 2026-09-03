/**
 * 职责：本 Demo 的运行时单例 —— 端口 + 当前 LLM 客户端（可能为 null）。
 *
 * 数据流：
 *   apps/.env → getLlmOptional() → llm（当前 LLM_PROVIDER 没配 Key 时是 null）
 *   process.env.PORT → PORT（默认 50201 = 5 + 模块 02 + 小节 01，§5.3.3）
 *
 * 为什么单独成文件：
 *   /health 与 /api/real 必须看到同一份运行时。分散在各 route 里各建一次，
 *   会出现「页脚说有 Key、真实模型页又说没 Key」这种自相矛盾。
 *   用 getLlmOptional 而不是 getLlm：没 Key 时服务照样起得来，
 *   模拟 SSE / 一次性对照不依赖 Key；真实模型页通过 /health 提前锁按钮（§5.3.9）。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

/** 没配 Key 时为 null；所有用它的地方都必须先判空。 */
export const llm = getLlmOptional();

/** 本 Demo 只跑协议 A（OpenAI Chat Completions）。 */
export const PROTOCOL = "A" as const;

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50201)
  .parse(process.env.PORT ?? undefined);
