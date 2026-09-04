/**
 * 职责：POST /api/transform —— schema 不只校验，还能改结构（补 repaired / when）。
 * 数据流：{ raw } → 闸门 → Enriched.parse；不合法时 ZodError → 400。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { readJsonPayload } from "../lib/http/request-guards.js";
import { runTransform } from "../lib/schema/intent.js";

export function mountTransformRoutes(router: Router): void {
  router.post("/api/transform", (ctx: Context) => {
    logger.info("route.transform", "POST /api/transform", "前端点了 transform 按钮；记入参便于核对 default 补全与新增字段");
    const payload = readJsonPayload(ctx);
    if (payload === null) return;
    try {
      ctx.body = { value: runTransform(payload) };
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        logger.warn(
          "schema.transform",
          "← Enriched.parse 失败",
          "transform 前的 Intent 校验没过；issues 一起打出来便于核对哪条 field 不合法（与 /api/parse 应一致）",
          { issuesCount: error.issues.length, issues: error.issues, __code: "if (error instanceof z.ZodError)" },
        );
        ctx.status = 400;
        ctx.body = { error: "transform 前的校验没过", detail: error.issues };
        return;
      }
      logger.error("schema.transform", "unexpected error", "transform 入口抛了非 ZodError；这通常是程序 bug 不是 schema 问题，记 err 便于排错", { err: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });
}
