/**
 * 职责：三个业务端点共用的入参闸门 —— 从 body.raw 解析出 JSON 对象。
 * 数据流：{ raw: string } → JSON.parse；缺 raw / 非法 JSON 直接 400。
 * 本条不调 LLM，不查 Key。
 */
import type { Context } from "koa";
import { z } from "zod";

const bodySchema = z.object({
  raw: z.string(),
});

export function readJsonPayload(ctx: Context): unknown | null {
  const parsed = bodySchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: "请求体不合法，需要 { raw: string }", detail: parsed.error.issues };
    return null;
  }
  if (parsed.data.raw.trim().length === 0) {
    ctx.status = 400;
    ctx.body = { error: "raw 不能为空。请贴一段 JSON 对象。" };
    return null;
  }
  try {
    return JSON.parse(parsed.data.raw) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.status = 400;
    ctx.body = { error: "raw 不是合法 JSON：" + message };
    return null;
  }
}
