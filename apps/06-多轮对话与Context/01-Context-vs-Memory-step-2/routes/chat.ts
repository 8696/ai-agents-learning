/**
 * 职责：POST /api/chat —— 把客户端送来的 messages 数组 + 从 Memory 读出的偏好注入 system，
 *       一起发给模型；返回助手回复；把完整 Context 形状 + 注入的偏好段打到服务端日志（§5.3.16 五件套 + 字段释义）。
 *
 * 数据流：
 *   浏览器 fetch { messages: [{role, content}] }
 *     → Zod 闸门
 *       → 调 getLlm() 拿客户端 + 模型 id
 *         → 调 kvList(USER_ID) 读偏好（step-2 新增）→ 拼到 system 末尾
 *           → openai.chat.completions.create（协议 A · 与本模块学习节奏一致）
 *             → 打日志：完整 messages（含注入的 system）+ token 估算 + fromMemory + 模型返回值 + 耗时
 *               → 出参 { reply, messages, totalTokens }
 *
 * 教学锚点（本条「Context vs Memory」step-2 · Memory 持久化）：
 *   - step-1：客户端送什么 messages，服务端就发什么给模型；前端 messages = Context；刷新页面 = 没了
 *   - step-2：服务端在调 LLM 前从 preferences.db 读偏好 → 拼到 system 末尾；客户端 React state 看不到这段
 *   - 跨会话还记：刷新页面 / 关浏览器后再次发消息，fromMemory 仍非空 → 模型仍按偏好回答 → 证明 Memory 真生效
 *   - 不在本 step-2：O3 覆盖（同名 key 整体覆盖）+ O4 删除 UI（端点保留，step-3 再上「忘掉所有」按钮）
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { encode } from "gpt-tokenizer";
import { getLlm } from "../../../llm.js";
import { kvList, USER_ID } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const messageSchema = z.object({
  // step-1 只演示 Context 累积（system/user/assistant 三方往返）；
  // tool 角色需要 tool_call_id，本条不演示，避免把 schema 写宽让 TS 校验失败
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1, "content 不能为空字符串"),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1, "messages 不能为空数组"),
});

export function mountChatRoutes(router: Router): void {
  router.post("/api/chat", async (ctx: Context) => {
    // ── ① 入参闸门：防 malformed body ──
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: "bad_request", issues: parsed.error.issues };
      logger.warn("chat.bad_request", "调用函数结束：chat（失败）", "入参 Zod 没通过；返回 400 给前端", {
        issues: parsed.error.issues,
      });
      return;
    }
    const { messages } = parsed.data;

    // ── ② 取 LLM 客户端（缺 Key 直接 502 让前端知道）──
    let llm;
    try {
      llm = getLlm();
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "no_llm", message: (err as Error).message };
      logger.error("chat.no_llm", "调用函数结束：chat（失败）", "getLlm 抛错；apps/.env 没配当前提供商的 Key", {
        error: err,
      });
      return;
    }

    // ── ②.5 step-2 新增：读 Memory → 拼到 system 末尾（演示 O2 注入）──
    // 这一段才是 step-2 vs step-1 的最大区别：刷新页面 / 关浏览器再打开，
    // userPrefs 仍非空（从 preferences.db 读出）→ 模型仍能看到「用户偏好」
    const userPrefs = await kvList(USER_ID);
    const prefsCount = Object.keys(userPrefs).length;
    const baseSystem = `你是 XX 助手。请按用户偏好回答。${prefsCount > 0 ? `\n\n[用户偏好 · 从 Memory 持久化层注入]\n${JSON.stringify(userPrefs, null, 2)}` : ""}`;

    // 拼 finalMessages：第一条是后端注入的 system；客户端可能传的 system 被丢弃（避免覆盖）
    const finalMessages = [
      { role: "system" as const, content: baseSystem },
      ...messages.filter(m => m.role !== "system"),
    ];

    // ── ③ 算 Context 的体积（最终发模型的 finalMessages 拼成一段后 encode）──
    // 注：这是粗估，不是模型真实计费值；目的是让学习者看见「Context 多大」（含注入的偏好段）
    const joinedForCount = finalMessages.map(m => `${m.role}: ${m.content}`).join("\n");
    const totalTokensEstimate = encode(joinedForCount).length;

    // 把要发给模型的请求体先拼好 —— 这一份就是要进 LLM 的完整 Context
    const request = {
      model: llm.modelA,
      messages: finalMessages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
    };

    logger.info("chat.handler", "调用函数开始：chat", "为什么打：路由是 Context 进入模型的唯一入口；不打完整 messages 下面就讲不清「Context 是什么」；不打 fromMemory 下面就讲不清「偏好从哪来」。当前：拿到前端 messages + 从 db 读了偏好。", {
      入参: { request, totalTokensEstimate, fromMemory: userPrefs },
      字段释义: {
        "request.model": "本轮用的模型 id（来自 apps/.env 顶层 LLM_MODEL 或该家默认）",
        "request.messages": "本轮完整 Context —— 后端注入的 system（基础规则 + 偏好段）+ 客户端传来的多轮 user/assistant",
        "request.messages[0].content 的「[用户偏好 · 从 Memory 持久化层注入]」段": "本轮调 LLM 前从 kvList(USER_ID) 拼到 system 末尾；前端 React state 看不到这段；服务端日志里能看见（=「Memory 注入」的可观察点）",
        "totalTokensEstimate": "finalMessages 拼成一段后用 gpt-tokenizer 算的粗估 token 数（包含注入的偏好段，不是计费值）",
        "fromMemory": "本次发送前从 kvList 读出的偏好；空对象 = 用户还没记任何偏好 → 行为与 step-1 等价",
      },
      本轮为什么是这些参数: {
        "request.messages[0].content（注入偏好段）": "如果用户在之前会话 / 本会话写过偏好 → 拼到 system 末尾；模型据此回答；如果用户没记过 → system 只有基础规则，与 step-1 行为等价。客户端传的 system 会被丢弃（filter 掉），避免覆盖。",
        "fromMemory": "来自 preferences.db；step-2 vs step-1 的最大区别 = 这一段。关掉浏览器 / 刷新页面后再次发消息，fromMemory 仍非空 → 证明 Memory 真生效（不是 Context 在累积）。",
        "request.model": "来自 apps/.env 顶层 LLM_MODEL 或该家默认（与本条教学无关；日志里顺手记一下方便排查）。",
        "totalTokensEstimate": "gpt-tokenizer 粗估；含注入的偏好段——偏好越多 token 数越多，学习者能亲眼看见 Context 体积的变化趋势。",
      },
      __code: "const completion = await llm.openai.chat.completions.create(request);",
    });

    const t0 = Date.now();
    try {
      const completion = await llm.openai.chat.completions.create(request);
      const reply = completion.choices[0]?.message?.content ?? "";
      // 把助手回复合进 messages，下次回传上下文就用这份（含注入的 system 段 + 新 assistant）
      const fullMessages = [...finalMessages, { role: "assistant" as const, content: reply }];
      const replyTokens = encode(reply).length;

      logger.info("chat.handler", "调用函数结束：chat", "为什么打：要把完整 messages 留作下一轮 Context 的起点。当前：模型已返回；前端拿 fullMessages 当下轮入参。", {
        返回值: { reply, usage: completion.usage ?? null },
        字段释义: {
          "reply": "assistant 这一轮的 content",
          "fullMessages": "本轮 Context + 新增的 assistant 消息 = 下一轮的起点",
          "usage.prompt_tokens": "本次请求发给模型的 token 数（仅协议 A 严格模式下存在）",
          "usage.completion_tokens": "本次模型生成 token 数",
        },
        耗时ms: Date.now() - t0,
      });

      ctx.body = {
        reply,
        messages: fullMessages,
        totalTokens: totalTokensEstimate + replyTokens,
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
      };
    } catch (err: unknown) {
      logger.error("chat.handler", "调用函数结束：chat（失败）", "模型调用本身抛错（限流 / 网络 / 超时）；原始错误对象原样进日志", {
        error: err,
        耗时ms: Date.now() - t0,
      });
      ctx.status = 502;
      ctx.body = {
        error: "upstream_failed",
        message: (err as Error).message,
      };
    }
  });
}