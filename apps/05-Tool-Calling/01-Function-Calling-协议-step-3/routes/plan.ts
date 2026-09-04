/**
 * 职责：POST /api/plan —— 单跑场景（对应 pages/single.html）。
 * 数据流：
 *   POST { scenario, mode: "parallel" | "serial" } →
 *     ① 决定 tool_calls（mock 3 个：search_flight / get_weather / get_packing_list）
 *     ② 执行（mode 决定 Promise.all 还是 for await 串行）
 *     ③ 每条 tool_call 记录 startMs / endMs → gantt 时序图数据
 *     ④ ctx.body = { mode, totalMs, results, timeline }
 *
 * step-3 唯一新增（vs step-1/2）：handler 改 async + Promise.all 真有物理意义；
 *   step-1/2 handler 同步 → Promise.all 也"瞬间完成"，看不出"并行"。
 *
 * 与 routes/compare.ts 的关系：本路由服务"单跑"页面（pages/single.html，mode 切换
 *   parallel|serial）；"串/并行对比"页面（pages/compare.html）走 routes/compare.ts，
 *   由 compare 路由在服务端并发两个 sub-call 拿两份结果。**页与接口 1:1**
 *   （[§5.3.8 页与接口 1:1 规则](../../agents/05-demo.md#538-http-demo-拆分多场景--多接口时强制)）。
 *
 * 教学锚点（覆盖 MD 需求 1）：模型一次返回 3 个 tool_call → Promise.all 并发 → 时序图 3 个 bar 同时起步。
 *
 * 日志（§5.3.16）：plan.received / dispatch.start / dispatch.done / plan.sent 都打。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import {
  executeTool,
  getToolsMeta,
  planToolCalls,
  type ExecResult,
  type MockToolCall,
} from "../lib/tools/registry.js";
import { logger } from "../lib/logger.js";

// 一条 tool_call 的执行轨迹：用于 gantt 时序图
type TimelineEntry = {
  tool: string;
  tool_call_id: string;
  startMs: number;   // 相对 dispatch 开始的 ms
  endMs: number;
  durationMs: number;
  ok: boolean;
  error?: string;
};

// ── 路由 ──
export function mountPlanRoutes(router: Router): void {
  router.get("/api/tools", (ctx: Context) => {
    const meta = getToolsMeta();
    logger.info("tools.list", "GET /api/tools", "前端拉工具列表", { count: meta.length });
    ctx.body = { tools: meta };
  });

  router.post("/api/plan", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as { scenario?: unknown; mode?: unknown };
    const scenario = typeof body.scenario === "string" ? body.scenario : "";
    const mode = typeof body.mode === "string" ? body.mode : "";

    logger.info("plan.received", "POST /api/plan", "前端发来单跑请求；记 scenario + mode 决定走 Promise.all 还是 for await", {
      scenario, mode, bodyKeys: Object.keys(body),
    });

    // §5.3.12 入参闸门：scenario/mode 非法 → 400（不抛异常）
    if (scenario !== "tokyo-may-7days") {
      logger.warn("plan.bad-input", "scenario 不在白名单", "scenario 必须是 tokyo-may-7days；其它都按 400 处理", { scenario });
      ctx.status = 400;
      ctx.body = { error: "scenario 必须是 tokyo-may-7days" };
      return;
    }
    if (mode !== "parallel" && mode !== "serial") {
      logger.warn("plan.bad-input", "mode 非法", "mode 必须是 parallel | serial；其它都按 400 处理", { mode });
      ctx.status = 400;
      ctx.body = { error: "mode 必须是 parallel | serial" };
      return;
    }

    // ② 决定 tool_calls（mock 3 个 —— 对应 MD 需求 1「模型一次返回 3 个」）
    const calls: MockToolCall[] = planToolCalls(scenario);

    // ③ 执行 + 计时间（每个 tool_call 自己记录 startMs/endMs）
    const dispatchStart = Date.now();
    const results: ExecResult[] = [];
    const timeline: TimelineEntry[] = [];

    if (mode === "parallel") {
      // ── 关键：Promise.all 让 3 个 handler 真的同时跑 ──
      // 每个 promise 内部立刻记 startMs；handler 完成后记 endMs。
      // gantt 时序图能看到 3 个 bar 的 startMs 几乎相同（差 < 1ms），endMs 各自 ≈ handler sleep
      logger.info("dispatch.start", "Promise.all 并发执行", "并行 dispatch；3 个 handler 几乎同时起步，3 个 sleep 同时倒数", { count: calls.length, toolCallIds: calls.map((c) => c.id) });
      const promises = calls.map((c) => {
        const startMs = Date.now() - dispatchStart;
        return executeTool(c.name, c.arguments, c.id).then((r) => {
          const endMs = Date.now() - dispatchStart;
          timeline.push({
            tool: c.name,
            tool_call_id: c.id,
            startMs,
            endMs,
            durationMs: endMs - startMs,
            ok: r.ok,
            ...(r.ok ? {} : { error: r.error }),
          });
          return r;
        });
      });
      const settled = await Promise.all(promises);
      results.push(...settled);
    } else {
      // ── 对照：for await 串行 —— 总耗时 ≈ sum(handler sleeps) ──
      logger.info("dispatch.start", "for await 串行执行", "串行 dispatch；上一个 handler 完成才跑下一个；总耗时 = sum", { count: calls.length, toolCallIds: calls.map((c) => c.id) });
      for (const c of calls) {
        const startMs = Date.now() - dispatchStart;
        const r = await executeTool(c.name, c.arguments, c.id);
        const endMs = Date.now() - dispatchStart;
        timeline.push({
          tool: c.name,
          tool_call_id: c.id,
          startMs,
          endMs,
          durationMs: endMs - startMs,
          ok: r.ok,
          ...(r.ok ? {} : { error: r.error }),
        });
        results.push(r);
      }
    }

    const totalMs = Date.now() - dispatchStart;
    logger.info("dispatch.done", "执行完毕", "整批 tool_call 跑完；记 totalMs 便于和 gantt 视觉对账", { mode, totalMs, okCount: results.filter((r) => r.ok).length });

    ctx.body = { scenario, mode, totalMs, results, timeline };
    logger.info("plan.sent", "responded to client", "已返回", { status: 200, resultsCount: results.length, timelineCount: timeline.length });
  });
}