/**
 * 职责：本 Demo 的运行时单例 —— 端口 + 当前提供商客户端（可能没有 Key）。
 * 数据流：process.env.PORT / getLlmOptional() → routes/* 与 server.ts 启动日志共用。
 * 为什么单独成文件：三个 route 都要读同一份 PORT / llm；分散 parse 会出现
 *   「/health 报的端口和实际 listen 的端口不一致」这种最难查的错。
 */
import { z } from "zod";
import { getLlmOptional } from "../../../../llm.js";

// getLlmOptional 而不是 getLlm：没配 Key 时服务照样起得来，
// 页面靠 /health 的 hasKey=false 提前把按钮锁掉，比等请求 503 更早告诉人。
export const llm = getLlmOptional();

// §5.3.3 端口口径：5{模块两位}{小节两位} = 5 00 01。PORT= 只做单次覆盖。
export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50001)
  .parse(process.env.PORT ?? undefined);
