/**
 * 职责：本 Demo 的运行时单例 —— 监听端口 + 可选 LLM 客户端（本条不调模型，只给 /health 填页脚）。
 * 数据流：process.env.PORT / getLlmOptional() → routes/* + server.ts 启动日志。
 * 为什么单独成文件：/health 报的端口必须和 listen 的是同一个。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

export const llm = getLlmOptional();

// 端口口径 §5.3.3：顺序分配（占用表当前最大 + 1）。
export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50002)
  .parse(process.env.PORT || undefined);
