/**
 * 职责：POST /api/memory + GET /api/memory + DELETE /api/memory —— 用户偏好的写入 / 列出 / 删除。
 *       业务只调 lib/db.ts 的 KV 抽象（§5.3.17）；不直接接触 better-sqlite3 / fs。
 *
 * 数据流：
 *   POST   { key, value }     → kvSet("default", key, value)
 *   GET                       → kvList("default") → { preferences: Record<string, unknown> }
 *   DELETE { key }             → kvDel("default", key)
 *
 * 教学锚点（本条「Context vs Memory」step-2 · Memory 持久化 · 单变体 M2 + O1 + O2）：
 *   - O1 写入：POST 把偏好写进 SQLite（→ preferences.db）
 *   - O2 注入：routes/chat.ts 每次发消息前 kvList → 拼到 system 末尾 → 模型看到「用户偏好」
 *   - 跨会话还记：关浏览器 / 刷新页面 → 偏好仍在 db；下次发送仍注入（= step-2 vs step-1 最大区别）
 *   - 单变体：只演示 M2 偏好 + O1 写入 + O2 注入；O3 覆盖（同名 key 整体覆盖）+ O4 删除端点都留接口，UI 上 step-2 不显眼（step-3 才上「覆盖」/「清空」按钮）
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { kvSet, kvList, kvDel, USER_ID } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const setSchema = z.object({
  key: z.string().min(1, "key 不能为空").max(64, "key 太长（<=64）"),
  value: z.unknown(),  // 任意 JSON；kvSet 里 JSON.stringify
});

const delSchema = z.object({
  key: z.string().min(1),
});

export function mountMemoryRoutes(router: Router): void {
  router.post("/api/memory", async (ctx: Context) => {
    const parsed = setSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: "bad_request", issues: parsed.error.issues };
      logger.warn("memory.set.bad_request", "调用函数结束：memory.set（失败）", "Zod 没通过；返回 400 给前端", {
        issues: parsed.error.issues,
      });
      return;
    }
    const { key, value } = parsed.data;
    const t0 = Date.now();
    logger.info("memory.set", "调用函数开始：memory.set", "为什么写这条日志：演示 O1 写入（用户偏好 → SQLite 持久化）；写入后下次会话发送就能从 db 读出注入 system。当前：用户主动点「记住偏好」按钮。", {
      入参: { userId: USER_ID, key, value },
      __code: "await kvSet(USER_ID, key, value);",
    });
    await kvSet(USER_ID, key, value);
    logger.info("memory.set", "调用函数结束：memory.set", "为什么写这条日志：写入成功；下次发送会通过 kvList 读到这条偏好注入 model。当前：db 已写入磁盘 preferences.db。", {
      返回值: { ok: true, key, value },
      耗时ms: Date.now() - t0,
    });
    ctx.body = { ok: true, key, value };
  });

  router.get("/api/memory", async (ctx: Context) => {
    const t0 = Date.now();
    logger.info("memory.list", "调用函数开始：memory.list", "为什么写这条日志：演示 O2 列出（前端显示当前已记住的所有偏好）；页面加载时拿一次填 UI。当前：前端 GET 触发。", {
      入参: { userId: USER_ID },
      __code: "const prefs = await kvList(USER_ID);",
    });
    const prefs = await kvList(USER_ID);
    logger.info("memory.list", "调用函数结束：memory.list", "为什么写这条日志：返回给前端 + 给学习者看（页面 #memory-list 区域）。当前：rows → Record。", {
      返回值: { preferences: prefs, count: Object.keys(prefs).length },
      耗时ms: Date.now() - t0,
    });
    ctx.body = { preferences: prefs };
  });

  router.delete("/api/memory", async (ctx: Context) => {
    const parsed = delSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: "bad_request", issues: parsed.error.issues };
      logger.warn("memory.del.bad_request", "调用函数结束：memory.del（失败）", "Zod 没通过；返回 400 给前端", {
        issues: parsed.error.issues,
      });
      return;
    }
    const { key } = parsed.data;
    const t0 = Date.now();
    logger.info("memory.del", "调用函数开始：memory.del", "为什么写这条日志：演示 O4 删除（用户要求清某条偏好）；step-2 只保留端点，UI 上 step-3 才显眼（验证链路）。当前：DELETE 触发。", {
      入参: { userId: USER_ID, key },
      __code: "await kvDel(USER_ID, key);",
    });
    await kvDel(USER_ID, key);
    logger.info("memory.del", "调用函数结束：memory.del", "为什么写这条日志：证明 db 操作成功；下次发送那条偏好就不会再被注入。当前：rows - 1（如果之前存在）。", {
      返回值: { ok: true, key },
      耗时ms: Date.now() - t0,
    });
    ctx.body = { ok: true, key };
  });
}
