/**
 * 职责：POST /api/parse —— 同一份 payload 同时走 parse 语义和 safeParse 形状。
 * 数据流：{ raw } → 闸门 → runParse → ctx.body。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { readJsonPayload } from "../lib/http/request-guards.js";
import { runParse } from "../lib/schema/intent.js";

export function mountParseRoutes(router: Router): void {
  router.post("/api/parse", (ctx: Context) => {
    logger.info("route.parse", "POST /api/parse", "前端点了 parse 按钮；记录入参时长 + 命中是否进入闸门失败");
    const payload = readJsonPayload(ctx);
    if (payload === null) return;
    ctx.body = runParse(payload);
  });
}
