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

// ── 类型：协议 A `tool_calls[i].function` 字段对齐 ──
type ToolCall = { id: string; name: string; arguments: Record<string, unknown> };

// ── ② model 的"决定"：按 mode mock 不同 tool_calls（锁定后这层换真 LLM） ──
function decideToolCalls(mode: string, input: string): ToolCall[] {
  if (mode === "danger") {
    return [{ id: "call_1", name: "calc", arguments: { expression: "1 + 1" } }];
  }
  if (mode === "multi") {
    const city = input.includes("北京") ? "北京" : "深圳";
    return [
      { id: "call_1", name: "get_weather", arguments: { city } },
      { id: "call_2", name: "search", arguments: { query: input || "default" } },
    ];
  }
  // single：默认 get_weather
  const city = input.includes("北京") ? "北京" : "深圳";
  return [{ id: "call_1", name: "get_weather", arguments: { city } }];
}

// ── ⑤ model 基于 tool_results 拼最终回复（mock；锁定后换真 LLM 第二轮） ──
function buildFinalReply(results: ExecResult[]): string {
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
  return parts.length > 0 ? parts.join("；") + "。" : "（无 tool_call）";
}

export function mountChatRoutes(router: Router): void {
  // ── 列 Registry：给前端"Tool Registry 面板"用 ──
  router.get("/api/tools", (ctx: Context) => {
    ctx.body = { tools: getToolsMeta() };
  });

  // ── 跑一圈：按 mode 选 mock 流 ──
  router.post("/api/chat-mock", (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as { input?: unknown; mode?: unknown };
    const input = typeof body.input === "string" ? body.input.trim() : "";
    const mode = typeof body.mode === "string" ? body.mode : "single";

    // §5.3.12 入参闸门：empty input 且 mode != danger → 400（不抛异常）
    if (!input && mode !== "danger") {
      ctx.status = 400;
      ctx.body = { error: "input 不能为空（danger 模式可空）" };
      return;
    }

    // ② model 决定（mock）
    const model_tool_calls = decideToolCalls(mode, input);

    // ③ execute：真实场景 Promise.all 并发；这里同步也能看见形状
    //   关键：每个 tool_call 都过 Registry.executeTool —— Gateway + Zod + handler 一条龙
    const tool_results: ExecResult[] = model_tool_calls.map((c) =>
      executeTool(c.name, c.arguments, c.id),
    );

    // ⑤ model 第二轮：基于 tool_results 拼回复（mock；锁定后换真 LLM）
    const model_final_reply = buildFinalReply(tool_results);

    ctx.body = {
      user_input: input,
      mode,
      model_tool_calls,
      tool_results,
      model_final_reply,
    };
  });
}