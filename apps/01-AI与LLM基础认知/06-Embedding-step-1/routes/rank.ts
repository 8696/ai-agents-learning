/**
 * 职责：余弦正例端点 —— 按分数排序，或故意撞零向量。
 * 数据流：{ query, vsZero? } → rankByCosine 或 400。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { readQueryBody } from "../lib/http/request-guards.js";
import { cosineAgainstZero, rankByCosine } from "../lib/vec/compare.js";
import { EMBEDDING } from "../lib/vec/tables.js";

export function mountRankRoutes(router: Router): void {
  router.post("/api/rank", (ctx: Context) => {
    logger.info(
      "路由-/api/rank-入站",
      "POST /api/rank 进入",
      "正例端点入口：可能走排序路径，也可能走 vsZero 撞零向量路径",
      { rawBody: ctx.request.body },
    );
    const body = readQueryBody(ctx);
    if (!body) {
      logger.warn(
        "路由-/api/rank-闸门失败",
        "readQueryBody 返回 null（已回 400）",
        "闸门已经把 400 写回 ctx.body；这里只打日志便于复盘哪类失败最常见",
        { rawBody: ctx.request.body },
      );
      return;
    }
    logger.info(
      "路由-/api/rank-通过闸门",
      "query 合法，准备走分支",
      "正例分支点：vsZero 走撞零向量演示 400；否则走余弦排序主流程",
      { query: body.query, vsZero: body.vsZero },
    );

    if (body.vsZero) {
      try {
        const score = cosineAgainstZero(body.query);
        ctx.body = { error: "不应到达：零向量居然算出了分数", score };
        logger.error(
          "路由-/api/rank-零向量异常通过",
          "零向量居然算出了分数，预期抛错却返回了值",
          "正常应当 throw 后被 catch；这里出现说明上游有改动；记下 score 便于复盘",
          { query: body.query, score },
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.info(
          "路由-/api/rank-零向量撞闸门-按预期抛错",
          "零向量抛错被捕获，回 400 + 中文提示",
          "对照演示：让页面看见「算不了余弦」路径；记下 message 便于核对文案",
          { query: body.query, message },
        );
        ctx.status = 400;
        ctx.body = { error: message };
      }
      return;
    }

    const ranked = rankByCosine(body.query);
    ctx.body = {
      query: body.query,
      queryVector: EMBEDDING[body.query],
      ranked,
      takeaway: "分数越接近 1 越同向。宠物→猫/狗高、→石头低。Token 管哪个号，Embedding 管哪边近。",
    };
    logger.info(
      "路由-/api/rank-出站",
      "POST /api/rank 响应拼好返回",
      "正例出口：记下行数 + top1 / bottom1 分数，便于核对排序是否符合直觉",
      {
        query: body.query,
        rankedCount: ranked.length,
        topScore: ranked[0]?.score,
        bottomScore: ranked[ranked.length - 1]?.score,
      },
    );
  });
}
