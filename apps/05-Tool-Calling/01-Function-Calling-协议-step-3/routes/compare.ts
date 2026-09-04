/**
 * 职责：POST /api/compare —— 串/并行对比场景（对应 pages/compare.html）。
 * 数据流：
 *   POST { scenario } →
 *     ① 在服务端并发执行两个 sub-dispatch：mode=parallel + mode=serial
 *     ② 各 sub-dispatch 拿自己的 totalMs + timeline + results
 *     ③ 算加速比 speedup = serial.totalMs / parallel.totalMs
 *     ④ ctx.body = { scenario, parallelRun, serialRun, speedup }
 *
 * 与 routes/plan.ts 的关系：本路由服务"对比"页面（pages/compare.html），由本路由**在服务端**
 *   并发执行两个 sub-call 并聚合结果。前端不需要发两次 POST；服务端一次拿全两份数据。
 *   **页与接口 1:1**（[§5.3.8](../../agents/05-demo.md#538-http-demo-拆分多场景--多接口时强制)）。
 *
 * 教学锚点（覆盖 MD 需求 2）：串行 vs 并行 · 对比按钮 · 总耗时 + 加速比 = serial / parallel ≈ 2×。
 *
 * 日志（§5.3.16）：compare.received / compare.dispatch / compare.done / compare.sent 都打。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import {
  executeTool,
  planToolCalls,
  type ExecResult,
  type MockToolCall,
} from "../lib/tools/registry.js";
import { logger } from "../lib/logger.js";

type TimelineEntry = {
  tool: string;
  tool_call_id: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  ok: boolean;
  error?: string;
};

type SubRun = {
  mode: "parallel" | "serial";
  totalMs: number;
  results: ExecResult[];
  timeline: TimelineEntry[];
};

// 单次 sub-dispatch（mode 决定走 Promise.all 还是 for await）—— 本文件独有，
// 不抽到 lib/ 因为 plan.ts 也有类似逻辑但 ctx/logger 调用点不同；对比场景跑两份即可。
async function runOnce(
  calls: MockToolCall[],
  mode: "parallel" | "serial",
  dispatchStart: number,
): Promise<SubRun> {
  const results: ExecResult[] = [];
  const timeline: TimelineEntry[] = [];
  if (mode === "parallel") {
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
    results.push(...(await Promise.all(promises)));
  } else {
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
  return { mode, totalMs: Date.now() - dispatchStart, results, timeline };
}

// ── 路由 ──
export function mountCompareRoutes(router: Router): void {
  router.post("/api/compare", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as { scenario?: unknown };
    const scenario = typeof body.scenario === "string" ? body.scenario : "";

    logger.info("compare.received", "POST /api/compare", "前端发来对比请求；服务端并发跑 parallel + serial 两次 sub-dispatch", {
      scenario, bodyKeys: Object.keys(body),
    });

    // §5.3.12 入参闸门
    if (scenario !== "tokyo-may-7days") {
      logger.warn("compare.bad-input", "scenario 不在白名单", "scenario 必须是 tokyo-may-7days；其它都按 400 处理", { scenario });
      ctx.status = 400;
      ctx.body = { error: "scenario 必须是 tokyo-may-7days" };
      return;
    }

    const calls: MockToolCall[] = planToolCalls(scenario);

    // ── 两个 sub-dispatch 各有独立 dispatchStart（互不干扰）──
    // 服务端并发两个独立 dispatch（不是同一次 dispatch 内的多 tool_call）
    const parallelStart = Date.now();
    const serialStart = Date.now();

    logger.info("compare.dispatch", "服务端并发两个 sub-dispatch", "parallelStart + serialStart 各自起；结果后续聚合 speedup", {});
    const [parallelRun, serialRun] = await Promise.all([
      runOnce(calls, "parallel", parallelStart),
      runOnce(calls, "serial", serialStart),
    ]);

    const speedup = serialRun.totalMs / Math.max(parallelRun.totalMs, 1);
    logger.info("compare.done", "两路跑完", "记 speedup 与各自 totalMs 便于核对", {
      parallelMs: parallelRun.totalMs,
      serialMs: serialRun.totalMs,
      speedup: speedup.toFixed(2),
    });

    ctx.body = { scenario, parallelRun, serialRun, speedup };
    logger.info("compare.sent", "responded to client", "已返回；含 parallelRun + serialRun + speedup 三段", { status: 200 });
  });
}