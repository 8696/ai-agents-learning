/**
 * 职责：Token ID 反例端点 —— 只做整数相减，证明差值没有语义。
 * 数据流：{ query } → 闸门 → tokenIdDeltas → ctx.body。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readQueryBody } from "../lib/http/request-guards.js";
import { tokenIdDeltas } from "../lib/vec/compare.js";

export function mountTokenIdRoutes(router: Router): void {
  router.post("/api/token-id", (ctx: Context) => {
    const body = readQueryBody(ctx);
    if (!body) return;
    ctx.body = {
      query: body.query,
      rows: tokenIdDeltas(body.query),
      takeaway: "5001 和 3729 差多少，说明不了猫和狗亲不亲。Token ID 只是代号。",
    };
  });
}
