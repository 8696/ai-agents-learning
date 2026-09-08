/**
 * 职责：POST /api/switch —— 产品开关 → tool_choice → 单次补全。
 * 数据流：body Zod → resolveSwitch → callWithMappedChoice → 协议判定。
 *
 * 日志（§5.3.16）：调用函数 五件套（handleSwitch 封装层）；
 *   闸门挡掉（400/503）单独打 warn；thinking × required/object 边界单独打 warn；上游异常 502 单独打 error。
 */
import type Router from "@koa/router";
import type { Context, Next } from "koa";
import { z } from "zod";
import { callWithMappedChoice } from "../lib/llm/call-with-mapped-choice.js";
import { getRuntimeCtx } from "../lib/http/runtime-ctx.js";
import { logger } from "../lib/logger.js";
import { resolveSwitch, type SwitchId } from "../lib/switches/product-switches.js";
import { TOOL_NAMES, TOOLS } from "../lib/tools/registry.js";

const BodySchema = z.object({
  query: z.string().trim().min(1, "query 不能为空"),
  switchId: z.enum(["chat_only", "allow_tools", "force_lookup"]),
});

export function mountSwitchRoutes(router: Router): void {
  router.post("/api/switch", async (ctx: Context, _next: Next) => {
    const tHandlerStart = Date.now();
    const t0 = Date.now();

    logger.info(
      "api.switch",
      "调用函数开始：handleSwitch",
      "为什么打：route 只认这一层返回的结果包；里面 callWithMappedChoice 是「真活」。当前：用户点了设置页开关，要映射成 tool_choice 再调模型。",
      {
        入参: { body: ctx.request.body, bodyKeys: Object.keys((ctx.request.body ?? {}) as object) },
        __code: "BodySchema.safeParse + resolveSwitch",
      },
    );

    const parsed = BodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参不合法", detail: parsed.error.flatten() };
      logger.warn(
        "api.switch",
        "调用函数结束：handleSwitch（闸门拒绝）",
        "为什么打：400 入参错误；未出网。",
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
        "api.switch",
        "调用函数结束：handleSwitch（闸门拒绝）",
        "为什么打：503 缺 Key。",
        {
          返回值: { httpStatus: 503, error: "未配置 LLM Key" },
          耗时ms: Date.now() - t0,
        },
      );
      return;
    }

    const { query, switchId } = parsed.data;
    const sw = resolveSwitch(switchId as SwitchId);

    try {
      const result = await callWithMappedChoice({
        llm,
        query,
        toolChoice: sw.toolChoice,
        switchId: sw.id,
      });

      let protocolOk = true;
      let protocolLabel = "";
      let protocolDetail = "";
      if (sw.id === "chat_only") {
        protocolOk = !result.hasToolCalls;
        protocolLabel = protocolOk ? "✅ 只聊天生效" : "❌ 违约：禁调仍有 call";
        protocolDetail = protocolOk
          ? "开关「只聊天」→ none，响应无 tool_calls。"
          : "映射是 none，但模型仍产出了 tool_calls。";
      } else if (sw.id === "force_lookup") {
        protocolOk = result.hasToolCalls;
        protocolLabel = protocolOk ? "✅ 强制查库生效" : "❌ 违约 / 边界：强制无 call";
        protocolDetail = protocolOk
          ? "开关「强制查库」→ required，至少 1 个 tool_call。"
          : "映射是 required，但无 tool_calls（Provider 违约或 thinking 冲突——若后者会先 400）。";
      } else {
        protocolOk = true;
        protocolLabel = "允许工具 · auto（无硬失败）";
        protocolDetail = result.hasToolCalls
          ? "auto 下模型选择了调 Tool。"
          : "auto 下模型选择了不调（对闲聊 query 正常）。";
      }

      ctx.body = {
        ok: true,
        switch: {
          id: sw.id,
          label: sw.label,
          mapsTo: sw.mapsTo,
          hint: sw.hint,
        },
        request: {
          query,
          tool_choice: result.toolChoiceSent,
          tools: TOOL_NAMES,
          model: result.model,
          protocol: "A",
          mappingNote: `用户点「${sw.label}」→ 后端写入 ${sw.mapsTo}`,
        },
        response: {
          finish_reason: result.finishReason,
          content: result.content,
          tool_calls: result.toolCalls,
          hasToolCalls: result.hasToolCalls,
          usage: result.usage,
        },
        teaching: {
          expectHint: sw.hint,
          protocolOk,
          protocolLabel,
          protocolDetail,
        },
        toolsEcho: TOOLS,
        elapsedMs: result.elapsedMs,
      };

      logger.info(
        "api.switch",
        "调用函数结束：handleSwitch",
        "为什么打：开关映射跑完，前端按开关 id 常驻槽位。",
        {
          返回值: { switchId: sw.id, httpStatus: 200, hasToolCalls: result.hasToolCalls, protocolOk },
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
              "「强制查库」映射到 required，但 thinking 模型拒收。换非 thinking、关 thinking，或改用「允许工具」。",
          },
          switch: { id: sw.id, label: sw.label, mapsTo: sw.mapsTo },
          request: { query, tool_choice: sw.toolChoice, model: llm.modelA },
        };
        logger.warn(
          "api.switch",
          "调用函数结束：handleSwitch（失败）",
          "为什么打：产品开关撞上 thinking 边界。",
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
        "api.switch",
        "调用函数结束：handleSwitch（失败）",
        "为什么打：502 上游失败。",
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