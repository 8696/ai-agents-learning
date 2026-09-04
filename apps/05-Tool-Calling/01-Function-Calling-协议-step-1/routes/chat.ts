/**
 * 职责：POST /api/chat-mock + GET /api/tools —— 业务层只面对 Registry。
 * 数据流：
 *   POST: { input, mode } → mock 决定 tool_calls → executeTool(name, args) → tool_results → final_reply
 *   GET:  Registry 元信息（name / description / dangerous）
 *
 * step-1 sketch（§5.3.14）："模型决定"还是 mock；execute 改走 Registry + Gateway。
 *   锁定后这层换真 LLM：把 mock 换成 openai.chat.completions({ tools, tool_choice })，
 *   execute 路径不动（Registry 是 SDK 无关的中间层）。
 *
 * 三个 mode：
 *   - single  → 1 个 get_weather
 *   - multi   → get_weather + search 并行（Promise.all）
 *   - danger  → calc（gateway 必须拦；这是本条新增的核心教学点）
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { executeTool, getToolsMeta, type ExecResult } from "../lib/tools/registry.js";
import { logger } from "../lib/logger.js";

// ── 类型：协议 A `tool_calls[i].function` 字段对齐 ──
type ToolCall = { id: string; name: string; arguments: Record<string, unknown> };

// ── ② model 的"决定"：按 mode mock 不同 tool_calls（锁定后这层换真 LLM） ──
function decideToolCalls(mode: string, input: string): ToolCall[] {
  logger.debug(
    "模型决定-mock",
    "按 mode 生成 tool_calls",
    "step-1 不调真 LLM；锁定后这层换成 openai.chat.completions({ tools, tool_choice })",
    { mode, input, __code: "function decideToolCalls(mode: string, input: string): ToolCall[]" },
  );
  let calls: ToolCall[];
  if (mode === "danger") {
    calls = [{ id: "call_1", name: "calc", arguments: { expression: "1 + 1" } }];
  } else if (mode === "multi") {
    const city = input.includes("北京") ? "北京" : "深圳";
    calls = [
      { id: "call_1", name: "get_weather", arguments: { city } },
      { id: "call_2", name: "search", arguments: { query: input || "default" } },
    ];
  } else {
    // single：默认 get_weather
    const city = input.includes("北京") ? "北京" : "深圳";
    calls = [{ id: "call_1", name: "get_weather", arguments: { city } }];
  }
  logger.info(
    "模型决定-mock",
    "tool_calls 已生成",
    "协议 A 形态：tool_calls[i].function 用 name + arguments；锁定后 LLM 真返回的字段对齐同一形状",
    { count: calls.length, calls },
  );
  return calls;
}

// ── ⑤ model 基于 tool_results 拼最终回复（mock；锁定后换真 LLM 第二轮） ──
function buildFinalReply(results: ExecResult[]): string {
  logger.debug(
    "模型终回复-mock",
    "按 tool_results 拼人话",
    "step-1 不调真 LLM 第二轮；锁定后把这段换成 openai.chat.completions(messages 含 tool_results)",
    { resultCount: results.length, __code: "function buildFinalReply(results: ExecResult[]): string" },
  );
  const parts: string[] = [];
  for (const r of results) {
    if (!r.ok) {
      parts.push(`${r.tool} 被网关拒绝：${r.error}`);
      continue;
    }
    if (r.tool === "get_weather") {
      const c = r.result as { city: string; temp: number; sky: string };
      parts.push(`${c.city} ${c.temp} 度 ${c.sky}`);
    } else if (r.tool === "search") {
      const s = r.result as { query: string; results: { title: string }[] };
      parts.push(`"${s.query}" 命中 ${s.results.length} 条`);
    } else {
      parts.push(`${r.tool} 返回：${JSON.stringify(r.result)}`);
    }
  }
  const finalReply = parts.length > 0 ? parts.join("；") + "。" : "（无 tool_call）";
  logger.info(
    "模型终回复-mock",
    "最终回复已拼出",
    "协议 A 第二轮：模型拿到 tool_results 后生成自然语言回复；step-1 用模板拼，锁定后换成真 LLM",
    { finalReply },
  );
  return finalReply;
}

export function mountChatRoutes(router: Router): void {
  // ── 列 Registry：给前端"Tool Registry 面板"用 ──
  router.get("/api/tools", (ctx: Context) => {
    const meta = getToolsMeta();
    logger.info(
      "Registry 列示",
      "GET /api/tools 出站",
      "前端 Tool Registry 面板拉一次；只返回 name/description/dangerous 三个声明字段，不返 handler 实现",
      { count: meta.length, tools: meta },
    );
    ctx.body = { tools: meta };
  });

  // ── 跑一圈：按 mode 选 mock 流 ──
  router.post("/api/chat-mock", (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as { input?: unknown; mode?: unknown };
    const input = typeof body.input === "string" ? body.input.trim() : "";
    const mode = typeof body.mode === "string" ? body.mode : "single";

    logger.info(
      "聊天-mock 入站",
      "POST /api/chat-mock 收到",
      "step-1 不调真 LLM，但跑完整一遍 model → tool_call → execute → tool_result → model_final 协议骨架",
      { input, mode, bodyKeys: Object.keys(body) },
    );

    // §5.3.12 入参闸门：empty input 且 mode != danger → 400（不抛异常）
    if (!input && mode !== "danger") {
      logger.warn(
        "聊天-mock 入站",
        "入参校验失败回 400",
        "§5.3.12：input 为空且 mode 非 danger 时前端按钮未填文本；直接回 400 不抛异常，前端按 error 处理",
        { input, mode },
      );
      ctx.status = 400;
      ctx.body = { error: "input 不能为空（danger 模式可空）" };
      return;
    }

    // ② model 决定（mock）
    const model_tool_calls = decideToolCalls(mode, input);

    // ③ execute：真实场景 Promise.all 并发；这里同步也能看见形状
    //   关键：每个 tool_call 都过 Registry.executeTool —— Gateway + Zod + handler 一条龙
    logger.info(
      "工具执行-batch",
      "进入 executeTool 批处理",
      "协议 A 第三步：每个 tool_call 走 Registry → Gateway → Zod → handler；真实场景用 Promise.all 并发，这里同步走同样能看见形状",
      { batchSize: model_tool_calls.length, toolCallIds: model_tool_calls.map(c => c.id) },
    );
    const tool_results: ExecResult[] = model_tool_calls.map((c) =>
      executeTool(c.name, c.arguments, c.id),
    );

    // ⑤ model 第二轮：基于 tool_results 拼回复（mock；锁定后换真 LLM）
    const model_final_reply = buildFinalReply(tool_results);

    const responsePayload = {
      user_input: input,
      mode,
      model_tool_calls,
      tool_results,
      model_final_reply,
    };
    logger.info(
      "聊天-mock 出站",
      "POST /api/chat-mock 回包",
      "完整一圈跑通：model_tool_calls + tool_results + model_final_reply 三段全打，方便对照页面 §5.3.10 配色",
      {
        user_input: input,
        mode,
        toolCallCount: model_tool_calls.length,
        okCount: tool_results.filter(r => r.ok).length,
        failCount: tool_results.filter(r => !r.ok).length,
        model_final_reply,
      },
    );
    ctx.body = responsePayload;
  });
}