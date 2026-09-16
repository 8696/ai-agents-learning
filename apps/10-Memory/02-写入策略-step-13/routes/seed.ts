/**
 * 职责：POST /api/seed —— 演示用：往事实库灌 step-13 演示用数据。
 * 数据流：
 *   mode=fresh（默认）→ 清 kv + audit_log + idempotency_keys，再插入 4 条零碎事实
 *   mode=append       → 不清，追加 4 条（演示 NEW vs UPDATE 路径）
 * 返 { seeded: N, mode }
 *
 * 注：step-13 不需要对话原文 / 摘要 / 画像 / 容量阈值；只要 4 条零碎事实够 8-B 演示 NEW/UPDATE 路径。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const SeedBodySchema = z.object({
  mode: z.enum(["fresh", "append"]).optional(),
});

interface SeededFact {
  key: string;
  value: string;
  confidence: number;
}

const SEED_FACTS: SeededFact[] = [
  { key: "user_works_at",    value: "我在字节跳动做前端开发",   confidence: 0.95 },
  { key: "team_uses_python", value: "我们后端团队用 Python",     confidence: 0.9 },
  { key: "prefer_remote",    value: "我喜欢远程办公",            confidence: 0.85 },
  { key: "hobby",            value: "我周末喜欢爬山",            confidence: 0.8 },
];

const stmtSeed = db.prepare(`INSERT INTO kv (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
const stmtClearKv    = db.prepare("DELETE FROM kv WHERE user_id = ?");
const stmtClearAudit = db.prepare("DELETE FROM audit_log WHERE user_id = ?");
const stmtClearIdem  = db.prepare("DELETE FROM idempotency_keys WHERE user_id = ?");

export function mountSeedRoutes(router: Router): void {
  router.post("/api/seed", async (ctx: Context) => {
    const parsed = SeedBodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, { error: "BAD_BODY", explain: "请求体可选 mode（fresh | append）；不传默认 fresh。" });
      return;
    }
    const mode = parsed.data.mode || "fresh";

    logger.info(
      "调用函数-seed",
      "调用函数开始：POST /api/seed",
      `为什么写这条日志：第 8 关演示用——灌 4 条零碎事实。fresh 模式同时清 audit_log / idempotency_keys 让 8-B / 8-C 演示不被旧数据干扰。当前：拿到 mode = ${mode}。`,
      { 入参: { mode } },
    );

    const t0 = Date.now();
    if (mode === "fresh") {
      stmtClearIdem.run("default");
      stmtClearAudit.run("default");
      stmtClearKv.run("default");
      logger.info(
        "│ 调用函数-seed",
        "清库完成",
        "为什么写这条日志：fresh 模式清三张表——避免旧 audit / idempotency 干扰演示对照。",
        { userId: "default" },
      );
    }
    const seeded: string[] = [];
    for (const f of SEED_FACTS) {
      stmtSeed.run("default", f.key, JSON.stringify({ value: f.value, type: "语义记忆", confidence: f.confidence, source: "step-13 seed" }), new Date().toISOString());
      seeded.push(f.key);
    }
    logger.info(
      "调用函数-seed",
      "调用函数结束：POST /api/seed",
      `为什么写这条日志：让前端确认种了 ${seeded.length} 条。当前：seed 完成。`,
      { 返回值: { seeded, mode }, 耗时ms: Date.now() - t0 },
    );

    ctx.body = { seeded, mode, facts: SEED_FACTS };
  });
}
