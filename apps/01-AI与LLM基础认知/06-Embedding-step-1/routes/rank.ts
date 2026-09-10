/**
 * 职责：余弦正例端点 —— 按分数排序，或故意撞零向量。
 * 数据流：{ query, vsZero? } → rankByCosine 或 400。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostRank 封装层）；
 *   校验挡下已在 lib/http/request-guards.ts 写 warn；
 *   零向量按预期抛错是「对照演示成功」——记 info 而非 error。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { readQueryBody } from "../lib/http/request-guards.js";
import { cosineAgainstZero, rankByCosine } from "../lib/vec/compare.js";
import { EMBEDDING } from "../lib/vec/tables.js";

export function mountRankRoutes(router: Router): void {
  router.post("/api/rank", (ctx: Context) => {
    const tHandlerStart = Date.now();
    logger.info(
      "api.rank",
      "调用函数开始：handlePostRank",
      "为什么写这条日志：route 只认这一层返回的 ranked 或 400；里面 rankByCosine / cosineAgainstZero 是真正干活的那一层。当前：POST /api/rank 进入，可能走排序路径，也可能走 vsZero 撞零向量路径。",
      {
        入参: { rawBody: ctx.request.body },
        __code: `const body = readQueryBody(ctx);\nif (body.vsZero) { try { cosineAgainstZero(body.query); } catch { ctx.status=400; } }\nelse { ctx.body = { ..., ranked: rankByCosine(body.query) }; }`,
      },
    );

    const body = readQueryBody(ctx);
    if (!body) {
      logger.info(
        "api.rank",
        "调用函数结束：handlePostRank",
        "为什么写这条日志：校验已回 400，route 不用再算 ranked。当前：readQueryBody 已返回 null（校验在内部写过 warn），route 直接 return。",
        {
          返回值: { httpStatus: 400, ranked: null },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      return;
    }

    if (body.vsZero) {
      try {
        const score = cosineAgainstZero(body.query);
        logger.error(
          "api.rank",
          "调用函数结束：handlePostRank（失败）",
          "为什么写这条日志：对照演示——零向量应当 throw 让 catch 转 400；如果没抛就说明 cosine 改动让它能算了。当前：异常路径——零向量居然算出了分数。",
          {
            返回值: { httpStatus: 200, score, branch: "vsZero-not-thrown" },
            耗时ms: Date.now() - tHandlerStart,
            错误: new Error("零向量未按预期抛错"),
          },
        );
        ctx.body = { error: "不应到达：零向量居然算出了分数", score };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.info(
          "api.rank",
          "调用函数结束：handlePostRank",
          "为什么写这条日志：对照演示——零向量抛错被捕获，回 400 + 中文提示。info 不是 error，因为这是「对照演示成功」路径。当前：已回 400。",
          {
            返回值: { httpStatus: 400, error: message, branch: "vsZero-thrown" },
            耗时ms: Date.now() - tHandlerStart,
          },
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
      "api.rank",
      "调用函数结束：handlePostRank",
      "为什么写这条日志：route 要把 ranked + takeaway 写进 ctx.body 交给页面。当前：rankByCosine 已返回，sort 已完成。",
      {
        返回值: {
          query: body.query,
          rankedCount: ranked.length,
          topScore: ranked[0]?.score,
          bottomScore: ranked[ranked.length - 1]?.score,
        },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  });
}