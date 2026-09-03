/**
 * 职责：本 Demo 的运行时单例（只有 PORT）。
 * 数据流：process.env.PORT → 各 route / server 启动日志共用。
 * 为什么单独成文件：本条是多提供商对照，不能缓存「当前顶层 LLM_PROVIDER」那一家；
 *   各家客户端按请求里的 provider 现场 getLlmForProvider，端口口径仍只 parse 一次。
 */
import { z } from "zod";

export const PORT = z.coerce
  .number()
  .int()
  .positive()
  .default(50010)
  .parse(process.env.PORT ?? undefined);
