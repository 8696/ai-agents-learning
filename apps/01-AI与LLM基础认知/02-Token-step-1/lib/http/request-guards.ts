/**
 * 职责：POST /api/encode 的入参闸门。本条不调 LLM，不查 Key。
 * 数据流：ctx.request.body → { text }；空字符串直接 400，route 不再重复判空。
 */
import type { Context } from "koa";
import { z } from "zod";
import { logger } from "../logger.js";

const encodeBody = z.object({
  text: z.string(),
});

export function readEncodeBody(ctx: Context): { text: string } | null {
  const parsed = encodeBody.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    logger.warn("encode.gate-fail", "Zod 校验失败 → 400", "请求体形状不对（不是 { text: string }）；记 issues 便于排错页面前端拼错了什么", {
      issues: parsed.error.issues,
      raw: ctx.request.body,
    });
    ctx.status = 400;
    ctx.body = { error: "请求体不合法，需要 { text: string }", detail: parsed.error.issues };
    return null;
  }
  // ① 空文本拦在服务端：页面「故意发空」就是要看见这一类 HTTP 400。
  if (parsed.data.text.trim().length === 0) {
    logger.warn("encode.gate-empty", "text trim 后为空 → 400", "空串没有可切的内容，计费按 Token 空串就是 0；拦在 route 前不让 encode 走空", {
      rawLen: parsed.data.text.length,
    });
    ctx.status = 400;
    ctx.body = { error: "text 不能为空。计费按 Token，空串没有可切的内容。" };
    return null;
  }
  logger.debug("encode.gate-pass", "入参校验通过", "Zod 过 + 非空；记 textLen 便于核对 encode 输入规模", {
    textLen: parsed.data.text.length,
  });
  return parsed.data;
}
