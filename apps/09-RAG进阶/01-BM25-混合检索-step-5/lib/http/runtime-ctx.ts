/**
 * 职责：读本 Demo 默认端口，并拼 /health 要用的环境元信息。
 * 本步纯本地 BM25 对照，不调大模型。
 *
 * 数据流：loadRootEnv → process.env.PORT → zod default(50091)
 */
import { z } from "zod";
import { loadRootEnv } from "../../../../load-root-env.js";

loadRootEnv();

export const PORT = z.coerce.number().int().positive().default(50091).parse(process.env.PORT);

export function readHealth(): {
  ok: true;
  port: number;
  provider: null;
  model: null;
  hasKey: false;
  callsModel: false;
  library: "wink-bm25-text-search";
} {
  return {
    ok: true,
    port: PORT,
    provider: null,
    model: null,
    hasKey: false,
    callsModel: false,
    library: "wink-bm25-text-search",
  };
}
