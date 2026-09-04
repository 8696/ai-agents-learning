/**
 * 职责：POST /api/repair —— 把 Zod issues 拼成可以喂回模型的 repair 文本。
 * 数据流：{ raw } → 闸门 → runRepair → ctx.body。本条不真的调模型。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { readJsonPayload } from "../lib/http/request-guards.js";
import { runRepair } from "../lib/schema/intent.js";

export function mountRepairRoutes(router: Router): void {
  router.post("/api/repair", (ctx: Context) => {
    logger.info("route.repair", "POST /api/repair", "前端点了 repair 按钮；记录入参路径便于核对 prompt 是否真的写进了 issues");
    const payload = readJsonPayload(ctx);
    if (payload === null) return;
    ctx.body = runRepair(payload);
  });
}
