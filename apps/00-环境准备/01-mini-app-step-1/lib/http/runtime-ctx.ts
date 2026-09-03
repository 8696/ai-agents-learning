/**
 * 职责：本 Demo 的运行时单例 —— 端口 + 当前 LLM 客户端（可能为 null）。
 *
 * 数据流：
 *   apps/.env → getLlmOptional() → llm（当前 LLM_PROVIDER 没配 Key 时是 null）
 *   process.env.PORT → PORT（默认 50000，§5.3.3 顺序分配的起步口）
 *
 * 为什么单独成文件：
 *   /health 与 /api/chat 必须看到**同一份**运行时。分散在各 route 里各建一次，
 *   会出现「页脚说有 Key、发消息又说没 Key」这种自相矛盾。
 *   用 getLlmOptional 而不是 getLlm：没 Key 时服务照样起得来，
 *   页面才能通过 /health 提前显示 Key ❌ 并锁住按钮（§5.3.9），而不是点了才 503。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

/** 没配 Key 时为 null；所有用它的地方都必须先判空。 */
export const llm = getLlmOptional();

/** 本 Demo 只跑协议 A（OpenAI Chat Completions）；协议 B 对照在模块 02。 */
export const PROTOCOL = "A" as const;

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50000)
  .parse(process.env.PORT ?? undefined);
