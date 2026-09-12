/**
 * 职责：读本 Demo 默认端口，并拼 /health 要用的环境元信息。
 *
 * 数据流：loadRootEnv → process.env.PORT（yarn script inline）→ zod default(50079)
 *   → getLlmOptional 只为页脚展示模型服务商 / 模型 / 密钥，本步不调大模型。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";
import { loadRootEnv } from "../../../../load-root-env.js";

loadRootEnv();

export const PORT = z.coerce.number().int().positive().default(50079).parse(process.env.PORT);

export function readHealth(): {
  ok: true;
  port: number;
  provider: string | null;
  model: string | null;
  hasKey: boolean;
  callsModel: false;
} {
  const llm = getLlmOptional();
  return {
    ok: true,
    port: PORT,
    provider: llm?.provider ?? null,
    model: llm?.modelA ?? null,
    hasKey: Boolean(llm),
    callsModel: false,
  };
}
