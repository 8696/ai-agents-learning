/**
 * 职责：余弦正例端点 —— 按分数排序，或故意撞零向量。
 * 数据流：{ query, vsZero? } → rankByCosine 或 400。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readQueryBody } from "../lib/http/request-guards.js";
import { cosineAgainstZero, rankByCosine } from "../lib/vec/compare.js";
import { EMBEDDING } from "../lib/vec/tables.js";

export function mountRankRoutes(router: Router): void {
  router.post("/api/rank", (ctx: Context) => {
    const body = readQueryBody(ctx);
    if (!body) return;

    if (body.vsZero) {
      try {
        cosineAgainstZero(body.query);
        ctx.body = { error: "不应到达：零向量居然算出了分数" };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.status = 400;
        ctx.body = { error: message };
      }
      return;
    }

    ctx.body = {
      query: body.query,
      queryVector: EMBEDDING[body.query],
      ranked: rankByCosine(body.query),
      takeaway: "分数越接近 1 越同向。宠物→猫/狗高、→石头低。Token 管哪个号，Embedding 管哪边近。",
    };
  });
}
