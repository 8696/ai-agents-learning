/**
 * 职责：程序性记忆 CRUD —— GET /api/program-rules（列）+ POST /api/program-rules（新增）+ DELETE /api/program-rules/:id（删除）。
 * 数据流：route ↔ lib/storage/program-rules.ts（内存 Map）。
 *
 * 这是同一资源（program-rules）的三个动作，按 §5.7 同文件。
 *
 * 跟 facts 路由的差异：facts 路由只暴露 list + clear（写操作只有一个 = 覆盖）；
 * program-rules 需要新增 / 删除任意条目，所以是 POST + DELETE-by-id。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { listRules, addRule, removeRule } from "../lib/storage/program-rules.js";
import { jsonBody, sendError } from "../lib/http/send-error.js";

const AddBodySchema = z.object({
  text: z.string(),
});

export function mountProgramRulesRoutes(router: Router): void {
  router.get("/api/program-rules", (ctx: Context) => {
    try {
      ctx.body = { rules: listRules() };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 500, {
        error: "RULES_READ_FAILED",
        explain: `读程序性规则失败：${message}`,
      });
    }
  });

  router.post("/api/program-rules", (ctx: Context) => {
    const parsed = AddBodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 text 字符串。",
      });
      return;
    }
    try {
      ctx.body = { rule: addRule(parsed.data.text) };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 400, {
        error: "RULE_ADD_FAILED",
        explain: `新增规则失败：${message}`,
      });
    }
  });

  router.delete("/api/program-rules/:id", (ctx: Context) => {
    const idRaw = ctx.params.id;
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
      sendError(ctx, 400, {
        error: "BAD_ID",
        explain: "id 必须是非负整数。",
      });
      return;
    }
    try {
      ctx.body = removeRule(id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 500, {
        error: "RULE_REMOVE_FAILED",
        explain: `删除规则失败：${message}`,
      });
    }
  });
}