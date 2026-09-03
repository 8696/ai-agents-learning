/**
 * 职责：POST /api/encode 的入参闸门。本条不调 LLM，不查 Key。
 * 数据流：ctx.request.body → { text }；空字符串直接 400，route 不再重复判空。
 */
import type { Context } from "koa";
import { z } from "zod";

const encodeBody = z.object({
  text: z.string(),
});

export function readEncodeBody(ctx: Context): { text: string } | null {
  const parsed = encodeBody.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: "请求体不合法，需要 { text: string }", detail: parsed.error.issues };
    return null;
  }
  // ① 空文本拦在服务端：页面「故意发空」就是要看见这一类 HTTP 400。
  if (parsed.data.text.trim().length === 0) {
    ctx.status = 400;
    ctx.body = { error: "text 不能为空。计费按 Token，空串没有可切的内容。" };
    return null;
  }
  return parsed.data;
}
