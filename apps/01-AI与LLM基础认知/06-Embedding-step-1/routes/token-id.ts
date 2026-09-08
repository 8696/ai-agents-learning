/**
 * 职责：Token ID 反例端点 —— 只做整数相减，证明差值没有语义。
 * 数据流：{ query } → 闸门 → tokenIdDeltas → ctx.body。
 *
 * 日志（§5.3.16）：调用函数 五件套（handlePostTokenId 封装层）；
 *   闸门挡掉已在 lib/http/request-guards.ts 写 warn；
 *   子调用 tokenIdDeltas 内部已自带五件套。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { readQueryBody } from "../lib/http/request-guards.js";
import { tokenIdDeltas } from "../lib/vec/compare.js";

export function mountTokenIdRoutes(router: Router): void {
  router.post("/api/token-id", (ctx: Context) => {
    const tHandlerStart = Date.now();
    logger.info(
      "api.token-id",
      "调用函数开始：handlePostTokenId",
      "为什么打：route 只认这一层返回的 { query, rows, takeaway }；里面那次 tokenIdDeltas 是「真活」（看「调用函数开始：tokenIdDeltas」）。当前：POST /api/token-id 收到请求，即将跑 readQueryBody → tokenIdDeltas。",
      {
        入参: { rawBody: ctx.request.body },
        __code: `const body = readQueryBody(ctx);\nconst rows = tokenIdDeltas(body.query);`,
      },
    );

    const body = readQueryBody(ctx);
    if (!body) {
      logger.info(
        "api.token-id",
        "调用函数结束：handlePostTokenId",
        "为什么打：闸门已回 400，route 不用再算 rows。当前：readQueryBody 已返回 null（闸门在内部写过 warn），route 直接 return。",
        {
          返回值: { httpStatus: 400, rows: null },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      return;
    }
    const rows = tokenIdDeltas(body.query);
    const takeaway = "5001 和 3729 差多少，说明不了猫和狗亲不亲。Token ID 只是代号。";
    ctx.body = {
      query: body.query,
      rows,
      takeaway,
    };

    logger.info(
      "api.token-id",
      "调用函数结束：handlePostTokenId",
      "为什么打：route 要把 rows + takeaway 写进 ctx.body 交给页面 stats 区。当前：rows 已落 ctx.body。",
      {
        返回值: {
          query: body.query,
          rowsCount: rows.length,
          takeaway,
        },
        耗时ms: Date.now() - tHandlerStart,
        字段释义: {
          takeaway: "反例的核心 takeaway——Token ID 只是代号",
        },
      },
    );
  });
}