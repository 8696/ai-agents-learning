/**
 * 职责：读本 Demo 默认端口，并拼 /health 要用的环境元信息。
 *
 * 数据流：loadRootEnv → process.env.PORT（yarn script inline）→ zod default(50093)
 *   → getLlmOptional 只为页脚展示。本步会调嵌入模型 + 调大模型做精排打分。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";
import { loadRootEnv } from "../../../../load-root-env.js";

loadRootEnv();

export const PORT = z.coerce.number().int().positive().default(50093).parse(process.env.PORT);

export function readHealth(): {
  ok: true;
  port: number;
  provider: string | null;
  model: string | null;
  embeddingModel: string | null;
  hasKey: boolean;
  callsModel: true;
} {
  const llm = getLlmOptional();
  return {
    ok: true,
    port: PORT,
    provider: llm?.provider ?? null,
    model: llm?.modelA ?? null,
    embeddingModel: llm?.embeddingModel ?? null,
    hasKey: Boolean(llm),
    callsModel: true,
  };
}