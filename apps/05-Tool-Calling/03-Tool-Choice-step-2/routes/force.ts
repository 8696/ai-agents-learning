/**
 * 职责：POST /api/force —— required vs 指定 name；结果按档位常驻对照。
 * 数据流：body Zod → callWithForcedChoice → 钉死判定（force 时 name 必须相等）。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handleForce 封装层）；
 *   校验挡下（400/503）单独写 warn；thinking × required/object 边界单独写 warn；上游异常 502 单独写 error。
 */
import type Router from "@koa/router";
import type { Context, Next } from "koa";
import { z } from "zod";
import {
  callWithForcedChoice,
  type ChoiceKind,
} from "../lib/llm/call-with-forced-choice.js";
import { getRuntimeCtx } from "../lib/http/runtime-ctx.js";
import { logger } from "../lib/logger.js";
import {
  FORCEABLE_NAMES,
  TOOL_NAMES,
  TOOLS,
  type ForceableName,
} from "../lib/tools/registry.js";

const BodySchema = z
  .object({
    query: z.string().trim().min(1, "query 不能为空"),
    choiceKind: z.enum(["required", "force"]),
    forcedName: z.enum(["query_logistics", "get_weather"]).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.choiceKind === "force" && !v.forcedName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "force 必须指定 forcedName",
        path: ["forcedName"],
      });
    }
  });

export function mountForceRoutes(router: Router): void {
  router.post("/api/force", async (ctx: Context, _next: Next) => {
    const tHandlerStart = Date.now();
    const t0 = Date.now();

    logger.info(
      "api.force",
      "调用函数开始：handleForce",
      "为什么写这条日志：route 只认这一层返回的结果包；里面 callWithForcedChoice 是真正干活的那一层。当前：前端选了 required 或钉死某个 Tool。",
      {
        入参: { body: ctx.request.body, bodyKeys: Object.keys((ctx.request.body ?? {}) as object) },
        __code: "BodySchema.safeParse(ctx.request.body)",
      },
    );

    const parsed = BodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参不合法", detail: parsed.error.flatten() };
      logger.warn(
        "api.force",
        "调用函数结束：handleForce（校验拒绝）",
        "为什么写这条日志：空 query / 缺 forcedName 是第一类错误（400）；未真发网络请求。",
        {
          返回值: { httpStatus: 400, error: "入参不合法" },
          耗时ms: Date.now() - t0,
        },
      );
      return;
    }

    const { llm } = getRuntimeCtx();
    if (!llm) {
      ctx.status = 503;
      ctx.body = {
        ok: false,
        error: "未配置 LLM Key",
        detail: "请在 apps/.env 配置当前 LLM_PROVIDER 对应的 API Key",
      };
      logger.warn(
        "api.force",
        "调用函数结束：handleForce（校验拒绝）",
        "为什么写这条日志：缺 Key（503）与 400 分开。",
        {
          返回值: { httpStatus: 503, error: "未配置 LLM Key" },
          耗时ms: Date.now() - t0,
        },
      );
      return;
    }

    const { query, choiceKind } = parsed.data;
    const forcedName = (parsed.data.forcedName ?? null) as ForceableName | null;

    try {
      const result = await callWithForcedChoice({
        llm,
        query,
        choiceKind: choiceKind as ChoiceKind,
        forcedName,
      });

      let protocolOk = true;
      let protocolLabel = "";
      let protocolDetail = "";

      if (choiceKind === "required") {
        protocolOk = result.hasToolCalls;
        protocolLabel = protocolOk ? "✅ required 有 call" : "❌ Provider 违约 / 无 call";
        protocolDetail = protocolOk
          ? `required 任选，实际调了 ${result.firstToolName}（不保证是你想要的那个）。`
          : "required 却无 tool_calls（Provider 可能违约）。";
      } else {
        const nameOk = result.firstToolName === forcedName;
        protocolOk = result.hasToolCalls && nameOk;
        if (!result.hasToolCalls) {
          protocolLabel = "❌ 无 tool_calls";
          protocolDetail = `指定了 ${forcedName}，但响应没有 tool_calls（thinking 冲突或 Provider 违约）。`;
        } else if (!nameOk) {
          protocolLabel = "❌ 钉死失败";
          protocolDetail = `指定 ${forcedName}，实际却是 ${result.firstToolName}。`;
        } else {
          protocolLabel = "✅ 钉死成功";
          protocolDetail = `tool name 恒等于 ${forcedName}（这就是指定函数 vs required 的差）。`;
        }
      }

      const slotKey =
        choiceKind === "required" ? "required" : `force:${forcedName ?? "?"}`;

      ctx.body = {
        ok: true,
        slotKey,
        request: {
          query,
          choiceKind,
          forcedName,
          tool_choice: result.toolChoiceSent,
          tools: TOOL_NAMES,
          model: result.model,
          protocol: "A",
        },
        response: {
          finish_reason: result.finishReason,
          content: result.content,
          tool_calls: result.toolCalls,
          hasToolCalls: result.hasToolCalls,
          firstToolName: result.firstToolName,
          usage: result.usage,
        },
        teaching: {
          expectHint:
            choiceKind === "required"
              ? "期望：至少 1 个 call；name 可能是物流或天气（任选）"
              : `期望：tool name === ${forcedName}`,
          protocolOk,
          protocolLabel,
          protocolDetail,
          forceableNames: [...FORCEABLE_NAMES],
        },
        toolsEcho: TOOLS,
        elapsedMs: result.elapsedMs,
      };

      logger.info(
        "api.force",
        "调用函数结束：handleForce",
        "为什么写这条日志：本档跑完，前端按 slotKey 常驻对照。",
        {
          返回值: { slotKey, httpStatus: 200, hasToolCalls: result.hasToolCalls, firstToolName: result.firstToolName, protocolOk },
          耗时ms: Date.now() - t0,
        },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const thinkingConflict =
        /tool_choice/i.test(message) &&
        /thinking/i.test(message) &&
        (/required/i.test(message) || /object/i.test(message));

      if (thinkingConflict) {
        ctx.status = 400;
        ctx.body = {
          ok: false,
          error: "thinking × 强制 Choice 冲突",
          detail: message,
          teaching: {
            code: "thinking_x_forced_choice",
            protocolOk: false,
            protocolLabel: "⚠ 边界 · thinking 不支持强制/object",
            protocolDetail:
              "thinking 模式拒收 required 与指定函数的 object。换非 thinking 模型、关 thinking，或本轮不用强制。",
          },
          request: {
            query,
            choiceKind,
            forcedName,
            tools: TOOL_NAMES,
            model: llm.modelA,
          },
        };
        logger.warn(
          "api.force",
          "调用函数结束：handleForce（失败）",
          "为什么写这条日志：thinking×object/required 是本条可观察边界。",
          {
            返回值: { httpStatus: 400, code: "thinking_x_forced_choice" },
            耗时ms: Date.now() - t0,
          },
        );
        return;
      }

      ctx.status = 502;
      ctx.body = { ok: false, error: "模型调用失败", detail: message };
      logger.error(
        "api.force",
        "调用函数结束：handleForce（失败）",
        "为什么写这条日志：上游失败走 502。",
        {
          返回值: { httpStatus: 502, error: message },
          耗时ms: Date.now() - t0,
          错误: error,
        },
      );
    }
    void tHandlerStart;
  });
}