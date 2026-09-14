/**
 * 职责：读端口和当前模型配置，给 /health 与 listen 用同一份。
 * 数据流：loadRootEnv → PORT.default(50097) + getLlmOptional()。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";
import { loadRootEnv } from "../../../../load-root-env.js";

loadRootEnv();

export const PORT = z.coerce.number().default(50097).parse(process.env.PORT);
export const llm = getLlmOptional();