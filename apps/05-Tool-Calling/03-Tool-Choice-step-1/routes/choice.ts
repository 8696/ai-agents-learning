/**
 * 职责：POST /api/choice —— 同 tools / 同 query，只换 tool_choice 跑一档。
 * 数据流：body Zod 闸门 → callWithToolChoice → 页面结果槽（前端按档位保留三份对照）。
 *
 * 日志（§5.3.16）：调用函数 五件套（handleChoice 封装层）；
 *   闸门挡掉（400/503）单独打 warn；thinking × required 边界单独打 warn；上游异常 502 单独打 error。
 */
import type Router from "@koa/router";
import type { Context, Next } from "koa";
import { z } from "zod";
import { callWithToolChoice, type ToolChoiceMode } from "../lib/llm/call-with-tool-choice.js";
import { getRuntimeCtx } from "../lib/http/runtime-ctx.js";
import { logger } from "../lib/logger.js";
import { TOOL_NAMES, TOOLS } from "../lib/tools/registry.js";

const BodySchema = z.object({
  query: z.string().trim().min(1, "query 不能为空"),
  toolChoice: z.enum(["auto", "none", "required"]),
});

export function mountChoiceRoutes(router: Router): void {
  router.post("/api/choice", async (ctx: Context, _next: Next) => {
    const tHandlerStart = Date.now();
    const t0 = Date.now();

    logger.info(
      "api.choice",
      "调用函数开始：handleChoice",
      "为什么打：route 只认这一层返回的结果包；里面 callWithToolChoice 是「真活」。当前：前端点了「跑这一档」，入口要先过 Zod 再调模型。",
      {
        入参: { body: ctx.request.body, bodyKeys: Object.keys((ctx.request.body ?? {}) as object) },
        __code: "const parsed = BodySchema.safeParse(ctx.request.body);",
      },
    );

    const parsed = BodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法",
        detail: parsed.error.flatten(),
      };
      logger.warn(
        "api.choice",
        "调用函数结束：handleChoice（闸门拒绝）",
        "为什么打：空 query / 非法 toolChoice 是教学用的第一类错误（400）。当前：未出网。",
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
        "api.choice",
        "调用函数结束：handleChoice（闸门拒绝）",
        "为什么打：缺 Key 是第二类错误（503），与 400 入参错误分开。当前：未出网。",
        {
          返回值: { httpStatus: 503, error: "未配置 LLM Key" },
          耗时ms: Date.now() - t0,
        },
      );
      return;
    }

    const { query, toolChoice } = parsed.data;
    try {
      const result = await callWithToolChoice({
        llm,
        query,
        toolChoice: toolChoice as ToolChoiceMode,
      });

      // 协议判定：required 必须有 call；none 必须无 call；auto 无硬失败
      let protocolOk = true;
      let protocolLabel = "auto · 无硬约束";
      let protocolDetail =
        "可调可不调；看 Description + query 是否匹配。本 Demo 只有物流 Tool，问天气时 auto 不调是正常的。";
      if (toolChoice === "required") {
        protocolOk = result.hasToolCalls;
        protocolLabel = protocolOk ? "✅ 符合 required" : "❌ Provider 违约";
        protocolDetail = protocolOk
          ? "至少 1 个 tool_call，硬规则生效（哪怕 query 与 Tool 不匹配，按语义也应硬调列表里某个）。"
          : "请求已写 tool_choice=required，但响应 tool_calls 为空。这是网关/模型没遵守协议，不是 Choice「其实不强制」。";
      } else if (toolChoice === "none") {
        protocolOk = !result.hasToolCalls;
        protocolLabel = protocolOk ? "✅ 符合 none" : "❌ Provider 违约";
        protocolDetail = protocolOk
          ? "无 tool_calls，禁调生效。"
          : "请求已写 tool_choice=none，但响应仍有 tool_calls。";
      }

      ctx.body = {
        ok: true,
        request: {
          query,
          tool_choice: toolChoice,
          tools: TOOL_NAMES,
          model: result.model,
          protocol: "A",
        },
        response: {
          finish_reason: result.finishReason,
          content: result.content,
          tool_calls: result.toolCalls,
          hasToolCalls: result.hasToolCalls,
          usage: result.usage,
        },
        teaching: {
          expectHint:
            toolChoice === "none"
              ? "期望：无 tool_calls，只有 content"
              : toolChoice === "required"
                ? "期望：至少 1 个 tool_call（本 Demo 只有 query_logistics；问天气也应硬调它）"
                : "期望：查物流类 query 通常会调 query_logistics；闲聊 / 天气可不调",
          protocolOk,
          protocolLabel,
          protocolDetail,
        },
        toolsEcho: TOOLS,
        elapsedMs: result.elapsedMs,
      };

      logger.info(
        "api.choice",
        "调用函数结束：handleChoice",
        "为什么打：本档跑完，前端会把结果写入对应档位槽位并保留对照。当前：成功响应。",
        {
          返回值: { toolChoice, httpStatus: 200, hasToolCalls: result.hasToolCalls, protocolOk: (ctx.body as { teaching?: { protocolOk?: boolean } }).teaching?.protocolOk, elapsedMs: result.elapsedMs },
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
            protocolLabel: "⚠ 边界 · thinking 不支持强制",
            protocolDetail:
              "当前模型处于 thinking / reasoning 模式时，网关不允许 tool_choice=required（也不允许指定函数的 object 形态）。这不是你传错字段，是 Provider 硬限制。可行：① 换非 thinking 模型 ② 关 thinking ③ 本轮改用 auto/none。",
            expectHint: "期望看见 HTTP 400 + 本条教学说明（变体 6）",
          },
          request: {
            query,
            tool_choice: toolChoice,
            tools: TOOL_NAMES,
            model: llm.modelA,
            protocol: "A",
          },
        };
        logger.warn(
          "api.choice",
          "调用函数结束：handleChoice（失败）",
          "为什么打：thinking × required/object 是本条可观察边界（400），与普通 502 上游失败分开。当前：网关拒收强制 Choice。",
          {
            返回值: { httpStatus: 400, code: "thinking_x_forced_choice" },
            耗时ms: Date.now() - t0,
          },
        );
        return;
      }

      ctx.status = 502;
      ctx.body = {
        ok: false,
        error: "模型调用失败",
        detail: message,
      };
      logger.error(
        "api.choice",
        "调用函数结束：handleChoice（失败）",
        "为什么打：上游模型/网关错误走 502，与 400/503 分开。当前：捕获 create 异常。",
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