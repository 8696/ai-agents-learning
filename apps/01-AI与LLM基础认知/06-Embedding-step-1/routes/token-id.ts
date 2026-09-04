/**
 * 职责：Token ID 反例端点 —— 只做整数相减，证明差值没有语义。
 * 数据流：{ query } → 闸门 → tokenIdDeltas → ctx.body。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { readQueryBody } from "../lib/http/request-guards.js";
import { tokenIdDeltas } from "../lib/vec/compare.js";

export function mountTokenIdRoutes(router: Router): void {
  router.post("/api/token-id", (ctx: Context) => {
    logger.info(
      "路由-/api/token-id-入站",
      "POST /api/token-id 进入",
      "反例端点入口：用户发来 { query }；先把整段打出来便于复盘",
      { rawBody: ctx.request.body },
    );
    const body = readQueryBody(ctx);
    if (!body) {
      logger.warn(
        "路由-/api/token-id-闸门失败",
        "readQueryBody 返回 null（已回 400）",
        "闸门已经把 400 写回 ctx.body；这里只打日志便于复盘哪类失败最常见",
        { rawBody: ctx.request.body },
      );
      return;
    }
    logger.info(
      "路由-/api/token-id-通过闸门",
      "query 合法，准备调 tokenIdDeltas",
      "反例：已经过闸门；记下 query 与 vsZero 标志位",
      { query: body.query },
    );
    const rows = tokenIdDeltas(body.query);
    const takeaway = "5001 和 3729 差多少，说明不了猫和狗亲不亲。Token ID 只是代号。";
    ctx.body = {
      query: body.query,
      rows,
      takeaway,
    };
    logger.info(
      "路由-/api/token-id-出站",
      "POST /api/token-id 响应拼好返回",
      "反例出口：记下行数与 takeaway，便于核对反例要点是否每次都打出来",
      { query: body.query, rowsCount: rows.length, takeaway },
    );
  });
}
