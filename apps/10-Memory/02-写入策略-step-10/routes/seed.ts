/**
 * 职责：POST /api/seed，演示用——往事实库里塞 6 条预设事实，validUntil 用「相对今天多少天」算（不是写死日期）。
 * 数据流：直接 raw SQL 插入 → 返 { seeded: N, mode }
 *
 * 为什么 validUntil 用 offsetDays 而不是写死日期：演示要看到「拖滑块跳 X 天 → 归档数量梯度变化」这种效果。
 * 如果 6 条 validUntil 都集中在一个固定日期，拖滑块就看不到梯度了。
 * offsetDays = 距今天多少天（正数=未来，负数=已过，null=永不变）。
 *
 * 6 条预设：
 *   1. i_am_colorblind       offsetDays=null      永不变（医疗/身份）
 *   2. team_tech_stack       offsetDays=null      永不变（长期工作信息）
 *   3. school                offsetDays=null      永不变（在校身份）
 *   4. next_review_meeting   offsetDays=+7       一周后到期（下周三，按今天算的相对时间）
 *   5. favorite_food          offsetDays=+30      一个月后到期（口味偏好，硬给个到期日）
 *   6. this_company_internship offsetDays=-1     昨天已过期（实习到八月）
 *
 * 拖滑块从 0 跳到 365，能看到归档数量从 1（只有已过期的 this_company_internship）→ 2（+next_review_meeting）→ 3（+favorite_food）的梯度。
 * 标了「永不变」或「重要」的事实永远不归档。
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

interface Preset {
  key: string;
  value: {
    value: string;
    type: "语义记忆" | "情景记忆";
    confidence: number;
    source: string;
  };
  /** 演示用：把 updated_at 写成「现在 - offsetDaysAgo 天」让衰减公式产生差异 */
  offsetDaysAgo: number;
  /** validUntil = today + validUntilOffsetDays（null = 永不变）—— 用 offset 不用绝对日期，方便演示梯度 */
  validUntilOffsetDays: number | null;
}

const PRESETS: Preset[] = [
  {
    key: "i_am_colorblind",
    value: { value: "我是色盲", type: "语义记忆", confidence: 1.0, source: "我可能是色盲" },
    offsetDaysAgo: 5,
    validUntilOffsetDays: null,  // 永不变
  },
  {
    key: "team_tech_stack",
    value: { value: "团队使用 Vue 3 + TypeScript", type: "语义记忆", confidence: 0.95, source: "我们组用 Vue 3 加 TypeScript" },
    offsetDaysAgo: 1,
    validUntilOffsetDays: null,  // 永不变
  },
  {
    key: "school",
    value: { value: "在北京大学读书", type: "语义记忆", confidence: 0.95, source: "我在北京大学读书" },
    offsetDaysAgo: 10,
    validUntilOffsetDays: null,  // 永不变
  },
  {
    key: "next_review_meeting",
    value: { value: "下周三下午三点有评审", type: "情景记忆", confidence: 0.9, source: "我下周三下午三点有个评审" },
    offsetDaysAgo: 2,
    validUntilOffsetDays: 7,  // 一周后到期（按今天算 + 7 天）
  },
  {
    key: "favorite_food",
    value: { value: "喜欢吃辣", type: "语义记忆", confidence: 0.8, source: "我最喜欢吃辣" },
    offsetDaysAgo: 90,
    validUntilOffsetDays: 30,  // 一个月后到期（模型给 importance=casual，半衰期 30 天；演示时 30 天后就过期）
  },
  {
    key: "this_company_internship",
    value: { value: "在这家公司实习到八月", type: "情景记忆", confidence: 0.9, source: "我在这家公司实习到八月" },
    offsetDaysAgo: 30,
    validUntilOffsetDays: -1,  // 昨天已过期（演示时立刻归档）
  },
];

const stmtSeed = kvDb.prepare(`INSERT INTO kv (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, importance = NULL, importance_reasoning = NULL`);
const stmtClear = kvDb.prepare("DELETE FROM kv WHERE user_id = ?");

function computeValidUntil(offsetDays: number | null): string | null {
  if (offsetDays === null) return null;
  return new Date(Date.now() + offsetDays * 86400_000).toISOString();
}

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
      `为什么写这条日志：第 6 关演示用——往事实库塞 6 条预设事实，validUntil 用「相对今天 N 天」算（不是写死日期）方便拖滑块看到梯度。当前：拿到 mode = ${mode}。`,
      { 入参: { mode } },
    );

    const t0 = Date.now();
    if (mode === "fresh") {
      stmtClear.run("default");
      logger.info(
        "│ 调用函数-seed",
        "清库完成",
        "为什么写这条日志：fresh 模式清库避免 step-9 旧事实干扰演示对比。",
        { userId: "default" },
      );
    }
    const seeded: string[] = [];
    for (const p of PRESETS) {
      const updatedAt = new Date(Date.now() - p.offsetDaysAgo * 86400_000).toISOString();
      // 把 validUntil 算成 ISO 字符串塞进 value JSON
      const valueWithValidUntil = { ...p.value, validUntil: computeValidUntil(p.validUntilOffsetDays) };
      stmtSeed.run("default", p.key, JSON.stringify(valueWithValidUntil), updatedAt);
      seeded.push(p.key);
    }

    logger.info(
      "调用函数-seed",
      "调用函数结束：POST /api/seed",
      `为什么写这条日志：让前端确认种了 6 条 + 各自 validUntil（相对今天 N 天算出来的 ISO 字符串）。当前：seed 完成。`,
      { 返回值: { seeded, mode }, 耗时ms: Date.now() - t0 },
    );

    ctx.body = { seeded, mode };
  });
}