/**
 * 职责：POST /api/dedup，手动去重入口。
 *
 * 数据流：{ key, value } → 调 dedupByKey → 按 action 决定调 kvSet
 *   - action = "new" → 调 kvSet 写入事实库
 *   - action = "noop" → 字面完全相同，不重复写
 *   - action = "conflict" → 同 key 但 value 不同，留在前端展示冲突
 *
 * 这是 step-7 简化版：只演示去重（变体 4-A 字面完全相同 → NOOP），
 * 不依赖 extractFacts / 维度判断 / 置信度 / 人工确认 / 三档分档——用户直接填 key + value。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { kvSet } from "../lib/db.js";
import { dedupByKey } from "../lib/flow/dedup-by-key.js";
import { logger } from "../lib/logger.js";

const DedupBodySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

function buildVerdict(key: string, value: unknown) {
  // 注意：value 不做 JSON.stringify，保持原样传入 dedupByKey；
  // dedup-by-key.ts 内部用 JSON.stringify 规范化两端再比对，
  // 这里再序列化一次会让字符串两端出现双层引号 → 字面比对永远不等。
  // FilterVerdict.candidate.value 类型是 string；把 unknown 走 JSON.stringify 归一化后再传。
  const normalizedValue = typeof value === "string" ? value : JSON.stringify(value);
  return {
    candidate: {
      key: key,
      value: normalizedValue,
      type: "语义记忆" as "情景记忆" | "语义记忆",
      confidence: 1.0,
      source: "手动 dedup 工具（step-7 简化版）",
      validUntil: null,
    },
    passed: true,
    confidence: 1.0,
    threshold: 0,
  };
}

export function mountDedupRoutes(router: Router): void {
  router.post("/api/dedup", async (ctx: Context) => {
    const parsed = DedupBodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 key 字符串 + value 字段（任意 JSON 可序列化值）。",
      });
      return;
    }

    const { key, value } = parsed.data;

    logger.info(
      "调用函数-dedup",
      "调用函数开始：dedup",
      "为什么写这条日志：step-7 简化版去重工具入口——按 (key, value) 查事实库，字面完全相同 → noop / 同 key 不同值 → conflict / 库里没有 → new 写入。当前：拿到 key + value，准备调 dedupByKey。",
      { 入参: { key, value }, __code: "const dedup = await dedupByKey(buildVerdict(key, value));" },
    );

    const verdict = buildVerdict(key, value);
    const dedup = await dedupByKey(verdict);

    if (dedup.action === "noop") {
      logger.info(
        "调用函数-dedup",
        "dedup 结果：字面完全相同 → NOOP",
        "为什么写这条日志：变体 4-A 命中——库里已有同 key + 同 value，不重复写、不刷新 updated_at。当前：dedup action = noop，事实库条数不变。",
        { 返回值: { dedup }, __code: "// 不调 kvSet，重复写等于白白刷新 updated_at（笔记 §4-A）" },
      );
      ctx.body = { action: "noop", key };
      return;
    }

    if (dedup.action === "conflict") {
      logger.info(
        "调用函数-dedup",
        "dedup 结果：同 key 不同值 → 冲突",
        "为什么写这条日志：变体 4-B 命中——库里已有同 key 但 value 不同，留在前端展示冲突，提示用户决定（变体 5 冲突更新留给后续 step）。当前：dedup action = conflict，不调 kvSet。",
        { 返回值: { dedup }, __code: "// 未来：变体 5 处理（新增 / 更新 / 删除 / NOOP 四选一）" },
      );
      ctx.body = { action: "conflict", key, existingValue: dedup.existingValue };
      return;
    }

    // dedup.action === "new"
    // 把字符串 value 包成业务 schema 对象（跟 step-1 抽取出的候选事实同形状），
    // 让 FactCard 组件能展示完整字段（type / confidence / source / validUntil），不只是裸字符串。
    const t0 = Date.now();
    const factValue = {
      value: typeof value === "string" ? value : JSON.stringify(value),
      type: "语义记忆",
      confidence: 1.0,
      source: "手动 dedup 工具（step-7 简化版）",
      validUntil: null,
    };
    await kvSet("default", key, factValue);
    logger.info(
      "调用函数-dedup",
      "dedup 结果：库里没有 → 已写入事实库",
      "为什么写这条日志：要记下这次落盘的关键 key + 耗时，方便排查「这条什么时候进的事实库」。当前：写入完成。",
      { 返回值: { action: "new", key, value: factValue }, 耗时ms: Date.now() - t0 },
    );
    ctx.body = { action: "new", key };
  });
}