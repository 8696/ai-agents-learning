/**
 * 职责：POST /api/seed，演示用——往事实库里灌 step-12 演示用数据。
 * 数据流：fresh 模式先清库，再插入
 *   - 5 条零碎事实（user_works_at / team_uses_python / prefer_remote / food_preference / hobby）
 *     → 用于「多条 → 画像」压缩演示
 *   - 1 段对话原文（存进 chat_session_v1 key 的 value 字段）
 *     → 用于「整段 → 会话摘要」压缩演示
 * 返 { seeded: N, mode, conversationText, scatteredFacts }
 *
 * 注：本步不需要「validUntil 演示」（那是 step-10 的范围）；也不需要「time-skip / 归档演示」（那是 step-10 的范围）。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { kvDb } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const SeedBodySchema = z.object({
  mode: z.enum(["fresh", "append"]).optional(),
});

interface ScatteredFact {
  key: string;
  value: string;
}

const SCATTERED_FACTS: ScatteredFact[] = [
  { key: "user_works_at",     value: "我在字节跳动做前端开发" },
  { key: "team_uses_python",  value: "我们后端团队用 Python" },
  { key: "prefer_remote",     value: "我喜欢远程办公" },
  { key: "food_preference",   value: "我中午喜欢吃轻食" },
  { key: "hobby",             value: "我周末喜欢爬山" },
];

/**
 * 12 轮真实对话原文（包含寒暄、跑题、中途改口、关键决策），演示「整段 → 会话摘要」。
 * 包含一个隐藏细节：「我在第 7 轮提过我对花生过敏」——摘要可能漏掉这个，用来看有损代价。
 */
const CONVERSATION_TEXT = `用户：你好，我们下周要在上海办一场技术分享会，主题是「LLM 实战」。
助手：好的，请告诉我一些细节。
用户：时间是 5 月 22 号下午两点，地点在徐汇区的一个创业园区。
用户：对了，我下午三点有个会，可能会迟到一会儿。
助手：明白，那时间调整到两点半？
用户：好，两点半就两点半。地点可以稍微改一下吗？我其实对那个园区过敏……不对，我对花生过敏。算了，地点不变。
用户：还有，谁来讲？我和我的同事李明，他负责后端那块。
用户：顺便问一下，午饭能解决吗？场地提供盒饭吗？
助手：盒饭不一定有，园区旁边有家轻食店，评分不错。
用户：行，那就通知大家两点半到场。
助手：好的，我来发邀请。`;

const stmtSeed = kvDb.prepare(`INSERT INTO kv (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, importance = NULL, importance_reasoning = NULL, summary = NULL, archived_at = NULL`);
const stmtClear = kvDb.prepare("DELETE FROM kv WHERE user_id = ?");

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
      `为什么写这条日志：第 7 关演示用——灌 5 条零碎事实 + 1 段对话原文。当前：拿到 mode = ${mode}。`,
      { 入参: { mode } },
    );

    const t0 = Date.now();
    if (mode === "fresh") {
      stmtClear.run("default");
      logger.info(
        "│ 调用函数-seed",
        "清库完成",
        "为什么写这条日志：fresh 模式清库避免旧数据干扰演示对比。",
        { userId: "default" },
      );
    }
    const seeded: string[] = [];
    // 写 5 条零碎事实
    for (const f of SCATTERED_FACTS) {
      const updatedAt = new Date().toISOString();
      stmtSeed.run("default", f.key, JSON.stringify({ value: f.value, type: "语义记忆", confidence: 0.9, source: "用户在多轮对话中提到" }), updatedAt);
      seeded.push(f.key);
    }
    // 写 1 段对话原文到 chat_session_v1 key
    stmtSeed.run("default", "chat_session_v1", JSON.stringify({ value: CONVERSATION_TEXT, type: "情景记忆", confidence: 1.0, source: "原始 12 轮对话" }), new Date().toISOString());
    seeded.push("chat_session_v1");

    logger.info(
      "调用函数-seed",
      "调用函数结束：POST /api/seed",
      `为什么写这条日志：让前端确认种了 ${seeded.length} 条（5 条零碎 + 1 段对话）。当前：seed 完成。`,
      { 返回值: { seeded, mode }, 耗时ms: Date.now() - t0 },
    );

    ctx.body = {
      seeded,
      mode,
      scatteredFacts: SCATTERED_FACTS.map(function (f) { return { key: f.key, value: f.value }; }),
      conversationText: CONVERSATION_TEXT,
    };
  });
}
