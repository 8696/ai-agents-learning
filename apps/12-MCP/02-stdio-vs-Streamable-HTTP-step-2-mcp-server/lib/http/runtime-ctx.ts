/**
 * 职责：读端口、灌环境、给 /health 用的元信息。本步不调大模型。
 * 数据流：process.env.PORT → 默认 50134；getLlmOptional 只给页脚显示模型服务商。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";
import { loadRootEnv } from "../../../../load-root-env.js";

loadRootEnv();

export const PORT = z.coerce.number().int().positive().default(50134).parse(process.env.PORT);

export function getHealthPayload(): {
  ok: true;
  port: number;
  provider: string | null;
  model: string | null;
  hasKey: boolean;
  callsModel: false;
  transport: "streamable-http";
} {
  const llm = getLlmOptional();
  return {
    ok: true,
    port: PORT,
    provider: llm?.provider ?? null,
    model: llm?.modelA ?? null,
    hasKey: Boolean(llm),
    callsModel: false,
    transport: "streamable-http",
  };
}