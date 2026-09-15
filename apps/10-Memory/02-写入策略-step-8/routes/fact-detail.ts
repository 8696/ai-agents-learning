/**
 * 职责：GET /api/fact/:key/history，列出一条事实的完整历史版本。
 * 数据流：kvHistory("default", key) → { history: HistoryEntry[] }
 *
 * 验收 ③：点开任一条事实能看见它的历史版本和每次变更时间。
 *
 * 一业务 URL 一个 route 文件：history 查询单独立文件，不并到 conflict.ts（冲突写入是写入路径，历史查询是读取路径）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { kvHistory } from "../lib/history-store.js";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const KeySchema = z.object({ key: z.string().min(1) });

export function mountFactDetailRoutes(router: Router): void {
  router.get("/api/fact/:key/history", async (ctx: Context) => {
    const parsed = KeySchema.safeParse({ key: ctx.params.key });
    if (!parsed.success) {
      sendError(ctx, 400, { error: "BAD_KEY", explain: "URL 里的 :key 必须是非空字符串。" });
      return;
    }
    const { key } = parsed.data;

    logger.info(
      "调用函数-fact-history",
      "调用函数开始：GET /api/fact/:key/history",
      "为什么写这条日志：mode-history sub-page 点开任一条事实 → 拉它的完整变更链（含 OLD / NEW / action / created_at），验收 ③。当前：拿到 key，准备按 userId + fact_key 查 fact_history。",
      { 入参: { userId: "default", key }, __code: "const history = await kvHistory('default', key);" },
    );
    const t0 = Date.now();
    const history = await kvHistory("default", key);
    logger.info(
      "调用函数-fact-history",
      "调用函数结束：GET /api/fact/:key/history",
      `为什么写这条日志：要把历史版本返回给页面 + 记下耗时。当前：查询完成，共 ${history.length} 条。`,
      { 返回值: { history }, 耗时ms: Date.now() - t0, 字段释义: {
        "history[].action": "update = UPDATE 改值 / merge = MERGE 合并 / delete = DELETE 软删",
        "history[].oldValue": "写入前的旧 value（业务 schema）",
        "history[].newValue": "写入后的新 value（业务 schema；delete 时为 null）",
        "history[].createdAt": "写入 fact_history 的时间（ISO 8601）",
      } },
    );
    ctx.body = { history, key };
  });

  // 兼容没有 body 时 sendError 解析失败（P-016）；本路由其实不用 body，但保留以防未来扩展
  void jsonBody;
}
