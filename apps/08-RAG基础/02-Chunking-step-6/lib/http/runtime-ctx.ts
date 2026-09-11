/**
 * 职责：本 Demo 默认端口。yarn 脚本 inline PORT 优先；这里只兜底。
 *
 * 不调 LLM：health 把 llm 作为 optional 导出（null 时页脚标「本地计算 · 不调 LLM」）。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const PORT = z.coerce.number().int().positive().default(50077).parse(process.env.PORT);

/** 不调 LLM：getLlmOptional()，缺 Key 也允许服务起；缺时 llm === null */
export const llm = getLlmOptional();