/**
 * 职责：POST /api/token-id 与 /api/rank 的入参闸门。本条不调 LLM，不查 Key。
 * 数据流：{ query } → 必须是玩具表里的四个词之一；空串 / 未知词直接 400。
 */
import type { Context } from "koa";
import { z } from "zod";
import { isWord, type Word } from "../vec/tables.js";

const bodySchema = z.object({
  query: z.string(),
  vsZero: z.boolean().optional(),
});

export function readQueryBody(ctx: Context): { query: Word; vsZero: boolean } | null {
  const parsed = bodySchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: "请求体不合法，需要 { query: string }", detail: parsed.error.issues };
    return null;
  }
  const q = parsed.data.query.trim();
  if (q.length === 0) {
    ctx.status = 400;
    ctx.body = { error: "query 不能为空。请用玩具表里的词：宠物 / 猫 / 狗 / 石头。" };
    return null;
  }
  if (!isWord(q)) {
    ctx.status = 400;
    ctx.body = { error: "query 不在玩具表里：" + q + "。只接受 宠物 / 猫 / 狗 / 石头。" };
    return null;
  }
  return { query: q, vsZero: Boolean(parsed.data.vsZero) };
}
