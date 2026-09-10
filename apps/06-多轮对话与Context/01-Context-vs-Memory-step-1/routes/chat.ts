/**
 * 职责：POST /api/chat —— 把客户端送来的 messages 数组（即「本轮 Context」）原样发给模型，
 *       返回助手回复；把完整 Context 形状打到服务端日志（§5.3.16 五条日志 + 字段释义）。
 *
 * 数据流：
 *   浏览器 fetch { messages: [{role, content}] }
 *     → Zod 校验（messages 必须是数组 / 每条 role + content 必填）
 *       → 调 getLlm() 拿客户端 + 模型 id
 *         → openai.chat.completions.create（协议 A · 与本模块学习节奏一致）
 *           → 打日志：完整 messages + token 估算 + 模型返回值 + 耗时
 *             → 出参 { reply, messages, totalTokens }
 *
 * 教学锚点（本条「Context vs Memory」step-1 最小可观察）：
 *   - 客户端送上来什么 messages，服务端就发什么给模型；前端 messages 数组就是 Context
 *   - 服务端日志把每一次请求的 messages 完整写出来 —— 学习者亲眼看见「这就是 Context 的形状」
 *   - 用 gpt-tokenizer（与模块 01-02 一致）估 token 数，让学习者看见 Context 的体积
 *   - Memory 不在本 step-1 —— 下一次刷新页面，messages 就没了（Context 跟一次会话绑定）
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { encode } from "gpt-tokenizer";
import { getLlm } from "../../../llm.js";
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
    // ── ① 入参校验：防 malformed body ──
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

    // ── ③ 算 Context 的体积（客户端 messages 拼成一个大字符串后 encode）──
    // 注：这是粗估，不是模型真实计费值；目的是让学习者看见「Context 多大」
    const joinedForCount = messages.map(m => `${m.role}: ${m.content}`).join("\n");
    const totalTokensEstimate = encode(joinedForCount).length;

    // 把要发给模型的请求体先拼好 —— 这一份就是要进 LLM 的完整 Context
    const request = {
      model: llm.modelA,
      messages: messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
    };

    logger.info("chat.handler", "调用函数开始：chat", "为什么写这条日志：路由是 Context 进入模型的唯一入口；不写完整 messages 下面就讲不清「Context 是什么」。当前：刚拿到前端 messages。", {
      入参: { request, totalTokensEstimate },
      字段释义: {
        "request.model": "本轮用的模型 id（来自 apps/.env 顶层 LLM_MODEL 或该家默认）",
        "request.messages": "本轮完整 Context —— 要发给模型的全部内容（含 system / 多轮 user+assistant）",
        "totalTokensEstimate": "messages 拼成一段后用 gpt-tokenizer 算的粗估 token 数（不是计费值）",
      },
      本轮为什么是这些参数: {
        "request.messages": "直接来自前端 React state 累积的 messages（= 上轮 fullMessages + 本轮新 user）；本路由不持久化任何上下文 —— 刷新页面 / 关浏览器 = 一切归零。这是 step-1 「看见 Context 累积」的核心可观察点：messages 数组本身就是 Context，没有别的源；下条需求才会出现跨会话的 Memory 源。",
        "request.model": "来自 apps/.env 顶层 LLM_MODEL 或该家默认（与本条教学无关；日志里顺手记一下方便排查）。",
        "totalTokensEstimate": "gpt-tokenizer 粗估，给学习者看 Context 体积变化的趋势（不是计费值；不是模型真实计费的 token 数）。",
      },
      __code: "const completion = await llm.openai.chat.completions.create(request);",
    });

    const t0 = Date.now();
    try {
      const completion = await llm.openai.chat.completions.create(request);
      const reply = completion.choices[0]?.message?.content ?? "";
      // 把助手回复合进 messages，下次回传上下文就用这份
      const fullMessages = [...messages, { role: "assistant" as const, content: reply }];
      const replyTokens = encode(reply).length;

      logger.info("chat.handler", "调用函数结束：chat", "为什么写这条日志：要把完整 messages 留作下一轮 Context 的起点。当前：模型已返回；前端拿 fullMessages 当下轮入参。", {
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