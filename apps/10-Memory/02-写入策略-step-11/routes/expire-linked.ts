/**
 * 职责：POST /api/expire-linked —— 一步调用:写新事实 + 自动挤掉被关联的旧事实(变体 6-D)。
 * 数据流：{ text } → ① 调 extractFacts 抽候选 + 写库 → ② 调第二次模型,问「这条新事实让哪些旧事实过期」 → ③ 调 expireLinkedFacts 归档被关联的旧事实 → 返 { written, archivedKeys, candidates }
 *
 * 为什么需要第二次模型调用：候选的 key 是模型自由发挥的(university / graduation_year / 等等),不能 hardcode
 * candidate key → school 关联。改成让模型看「用户的原话 + 库里当前事实列表」,自己判断要挤掉哪些旧事实。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { extractFacts } from "../lib/flow/extract-facts.js";
import { kvSet, kvList, kvGet } from "../lib/db.js";
import { expireLinkedFacts } from "../lib/flow/expire-linked.js";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";

const ExpireLinkedBodySchema = z.object({
  text: z.string().min(1, "text 不能为空"),
  conversationId: z.string().optional(),
});

function factValue(c: { value: unknown }): string {
  if (c.value && typeof c.value === "object" && "value" in c.value) return String((c.value as { value: unknown }).value);
  return String(c.value);
}

export function mountExpireLinkedRoutes(router: Router): void {
  router.post("/api/expire-linked", async (ctx: Context) => {
    const parsed = ExpireLinkedBodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 text 非空字符串（用户这一轮的对话内容）。",
      });
      return;
    }

    const { text, conversationId = "default" } = parsed.data;
    const t0 = Date.now();

    logger.info(
      "调用函数-expire-linked-route",
      "调用函数开始：POST /api/expire-linked",
      "为什么写这条日志：变体 6-D「被新事实挤掉」——用户发一段话，模型抽候选写库后，第二次模型调用问「这条新事实让哪些旧事实过期」，让模型自己判断关联键（不依赖 candidate key 名称）。当前：拿到 text。",
      { 入参: { text, conversationId }, __code: "extractFacts(text) → 写库 → 第二次模型调用问 expiresWith → expireLinkedFacts" },
    );

    // ① 调模型抽候选（和 step-1 共用）
    const extractResult = await extractFacts(text);
    const candidates = extractResult.candidates;
    logger.info(
      "│ 调用函数-expire-linked-route",
      "抽候选完成",
      `为什么写这条日志：让路由层知道模型抽了几条 + 各自 key。当前：抽到 ${candidates.length} 条。`,
      { 候选数: candidates.length, 候选keys: candidates.map(function (c) { return c.key; }) },
    );

    // 写库前检查冲突：如果 candidate.key 跟旧事同名 → 不写库（避免覆盖），把这条 candidate 的意图当作「要挤掉旧事」（推入 expiresWithKeys）
    const written: string[] = [];
    const conflictKeys: string[] = [];
    for (const c of candidates) {
      const existing = await kvGet(conversationId, c.key);
      if (existing !== undefined) {
        // 冲突：这条 candidate 的 key 跟旧事同名 → 跳过写库 + 加 expiresWithKeys
        conflictKeys.push(c.key);
        logger.info(
          "│ 调用函数-expire-linked-route",
          "key 冲突跳过写入",
          `为什么写这条日志：避免写候选时把旧事「在读学校」覆盖成新内容。模型抽 school 说明它想「挤掉」旧 school；直接当 expiresWithKeys 推入。`,
          { key: c.key, 旧事: existing },
        );
      } else {
        await kvSet(conversationId, c.key, {
          value: c.value,
          type: c.type,
          confidence: c.confidence,
          source: c.source,
          validUntil: c.validUntil,
        });
        written.push(c.key);
      }
    }
    logger.info(
      "│ 调用函数-expire-linked-route",
      "写库完成（含冲突处理）",
      `当前：written = ${written.length} 条，conflictKeys = ${conflictKeys.length} 条（被推到 expiresWithKeys 准备归档）。`,
      { written, conflictKeys },
    );

    // ② 第二次模型调用：问「这条新事实让哪些旧事实过期」+ 把 conflictKeys 加进去
    const currentFactsRaw = await kvList(conversationId);
    const currentFactsList = Object.keys(currentFactsRaw)
      .filter(function (k) { return written.indexOf(k) < 0 && conflictKeys.indexOf(k) < 0; }) // 排除刚写/已冲突的
      .map(function (k) { return { key: k, fact: factValue({ value: currentFactsRaw[k] }) }; });
    const linkPrompt = `你是「关联键检测员」。用户说了一段话：「${text}」

库里当前事实（key + 事实正文，不含刚才已处理过的）：
${currentFactsList.length > 0 ? currentFactsList.map(function (f) { return "- " + f.key + ": " + f.fact; }).join("\n") : "(库里没有其他事实了)"}

判断：这条新事实是否让某些旧事实不再相关？如果是，返回应该被归档的 key 列表。
例：用户说「我 2027 年要从北大毕业」→ 库里的「school: 在北京大学读书」应当被归档。
例：用户说「我换工作了」→ 库里的「job: 在 XX 公司」应当被归档。

返回 JSON: { "expiresWith": ["school", ...] }（没有就返回空数组）`;

    logger.info(
      "││ 调用函数-expire-linked-route",
      "第二次模型调用开始：检测关联键",
      "为什么写这条日志：让模型自己判断新事实让哪些旧事实过期，不依赖 candidate key 名称。",
      { 入参: { text, currentFactsCount: currentFactsList.length } },
    );

    const llm = await getLlm();
    const linkRequest = {
      model: llm.modelA,
      messages: [
        { role: "system" as const, content: "你是关联键检测员。看用户新说的事实 + 库里当前事实，判断这条新事实让哪些旧事实过期。返回 JSON。" },
        { role: "user" as const, content: linkPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" as const },
    };
    const linkResponse = await llm.openai.chat.completions.create(linkRequest);
    let linkContent = linkResponse.choices?.[0]?.message?.content || '{"expiresWith":[]}';
    linkContent = linkContent.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const fenceMatch = linkContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) linkContent = fenceMatch[1].trim();
    let linkParsed: { expiresWith?: string[] };
    try { linkParsed = JSON.parse(linkContent); } catch { linkParsed = { expiresWith: [] }; }
    const modelExpiresWith = Array.isArray(linkParsed.expiresWith) ? linkParsed.expiresWith : [];

    // 合并：模型语义判断 + 候选冲突 key → 去重
    const expiresWithKeys = Array.from(new Set(modelExpiresWith.concat(conflictKeys)));
    logger.info(
      "││ 调用函数-expire-linked-route",
      "第二次模型调用结束：检测关联键",
      `当前：模型判断要挤掉的 key 列表 = ${JSON.stringify(expiresWithKeys)}。`,
      { expiresWithKeys },
    );

    // ③ 自动挤掉被关联的旧事实（变体 6-D 的核心：直接按 model 返回的 key 列表 UPDATE 旧事实的 archived_at）
    const asOf = new Date().toISOString();
    const expireResult = expireLinkedFacts(conversationId, expiresWithKeys, asOf);

    const result = {
      written,
      conflictKeys,
      modelExpiresWith,
      archivedKeys: expireResult.archivedKeys,
      expiresWithKeys,
      candidates,
    };
    logger.info(
      "调用函数-expire-linked-route",
      "调用函数结束：POST /api/expire-linked",
      `当前：written = ${written.length}，conflictKeys = ${conflictKeys.length}，modelExpiresWith = ${modelExpiresWith.length}，archivedKeys = ${JSON.stringify(expireResult.archivedKeys)}，耗时 = ${Date.now() - t0}ms。`,
      { 返回值: result, 耗时ms: Date.now() - t0 },
    );

    ctx.body = result;
  });
}