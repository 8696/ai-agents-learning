/**
 * 职责：POST /api/token-id 与 /api/rank 的入参闸门。本条不调 LLM，不查 Key。
 * 数据流：{ query } → 必须是玩具表里的四个词之一；空串 / 未知词直接 400。
 *
 * 日志（§5.3.16）：工具档——五件套（含 __code）仍要；校验失败打 warn + 闸门拒绝。
 */
import type { Context } from "koa";
import { z } from "zod";
import { logger } from "../logger.js";
import { isWord, type Word } from "../vec/tables.js";

const bodySchema = z.object({
  query: z.string(),
  vsZero: z.boolean().optional(),
});

export function readQueryBody(ctx: Context): { query: Word; vsZero: boolean } | null {
  const parsed = bodySchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    logger.warn(
      "│ 入参闸门-readQueryBody",
      "调用函数结束：readQueryBody",
      "为什么打：路由入参结构不对（缺 query / 类型错），给前端 400；记下 issues 便于复盘。warn 是「业务失败但能走通」的等级。当前：Zod safeParse 未通过，已回 400。",
      {
        返回值: { ok: false, reason: "Zod 校验失败", status: 400 },
        issues: parsed.error.issues,
        rawBody: ctx.request.body,
      },
    );
    ctx.status = 400;
    ctx.body = { error: "请求体不合法，需要 { query: string }", detail: parsed.error.issues };
    return null;
  }
  const q = parsed.data.query.trim();
  if (q.length === 0) {
    logger.warn(
      "│ 入参闸门-readQueryBody",
      "调用函数结束：readQueryBody",
      "为什么打：用户可能只发了空白，给前端 400 提示用玩具表里的词。当前：query 去掉空白后为空，已回 400。",
      {
        返回值: { ok: false, reason: "query 去除空白后为空", status: 400 },
        rawQuery: parsed.data.query,
      },
    );
    ctx.status = 400;
    ctx.body = { error: "query 不能为空。请用玩具表里的词：宠物 / 猫 / 狗 / 石头。" };
    return null;
  }
  if (!isWord(q)) {
    logger.warn(
      "│ 入参闸门-readQueryBody",
      "调用函数结束：readQueryBody",
      "为什么打：正例/反例只能在这 4 个词上做；查 isWord 漏掉就 400，提示用户用合法词。当前：query 不在玩具表里，已回 400。",
      {
        返回值: { ok: false, reason: "query 不在玩具表里", status: 400 },
        query: q,
      },
    );
    ctx.status = 400;
    ctx.body = { error: "query 不在玩具表里：" + q + "。只接受 宠物 / 猫 / 狗 / 石头。" };
    return null;
  }
  logger.debug(
    "│ 入参闸门-readQueryBody",
    "调用函数结束：readQueryBody",
    "为什么打：Zod 过 + query 在玩具表里；记 query 与 vsZero 便于核对子调用入参。debug 是「细节」等级。当前：入参已通过校验。",
    {
      返回值: { ok: true, query: q, vsZero: Boolean(parsed.data.vsZero) },
    },
  );
  return { query: q, vsZero: Boolean(parsed.data.vsZero) };
}