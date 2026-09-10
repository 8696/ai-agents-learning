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
 * 日志（§5.3.16）：调用函数 五条日志（handlePostCompare 封装层）；
 *   校验挡下单独写 warn；子调用 executeTool 内部已自带五条日志。
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
  mockReply: string;   // step-3 新增：mock 的模型最终回复（按 mode 决定"真实"或"编造"）
};

// ── 编造检测（step-3 新增 · 覆盖 MD 需求 2 验收「模型最终回复是否编造」）──
// 编造定义：reply 里出现**不在 tool_result 里**的数字。
// 实现：从所有 tool_result.ok 的 result 对象里 flatten 出所有数字 → 集合 sourceNumbers；
//       从 reply 里 regex 提取数字 → 集合 replyNumbers；
//       fakeNumbers = replyNumbers \ sourceNumbers；isHallucinated = fakeNumbers 非空。
//
// 这是 mock 演示（step-3 不调 LLM），用 mode 模拟「模型嫌慢编造」：
//   parallel → mockReply 用真实数字（3500 / 22）→ isHallucinated = false
//   serial   → mockReply 编造数字（5500 / 25）→ isHallucinated = true
function extractNumbers(v: unknown, acc: number[] = []): number[] {
  if (typeof v === "number" && Number.isFinite(v)) {
    acc.push(v);
  } else if (Array.isArray(v)) {
    for (const item of v) extractNumbers(item, acc);
  } else if (v && typeof v === "object") {
    for (const val of Object.values(v as Record<string, unknown>)) extractNumbers(val, acc);
  }
  return acc;
}

function detectHallucination(reply: string, results: ExecResult[]): {
  isHallucinated: boolean;
  sourceNumbers: number[];
  replyNumbers: number[];
  fakeNumbers: number[];
} {
  // ① 从 tool_results 收集所有数字（源集）
  const sourceNumbers: number[] = [];
  for (const r of results) {
    if (r.ok) extractNumbers(r.result, sourceNumbers);
  }
  const sourceSet = new Set(sourceNumbers);

  // ② 从 reply 精准提取「可被引用的数字」—— 只看钱（¥ 后）和温度（°C 前）；
  //   "5 月去 7 天" 这种带量词的数字不算引用（即使 LLM 编也是量词，不是数据）。
  //   简化策略：先抓 ¥\s*(\d+...)，再抓 (\d+...)\s*°C；其它数字不参与编造判定。
  const replyNumbers: number[] = [];
  const moneyRe = /¥\s*(-?\d+(?:\.\d+)?)/g;
  const tempRe = /(-?\d+(?:\.\d+)?)\s*°C/g;
  let mm: RegExpExecArray | null;
  while ((mm = moneyRe.exec(reply)) !== null) {
    const n = Number(mm[1]);
    if (Number.isFinite(n)) replyNumbers.push(n);
  }
  while ((mm = tempRe.exec(reply)) !== null) {
    const n = Number(mm[1]);
    if (Number.isFinite(n)) replyNumbers.push(n);
  }

  // ③ fake = reply 里出现但 tool_result 里没有
  const fakeNumbers: number[] = [];
  for (const n of replyNumbers) {
    if (!sourceSet.has(n)) fakeNumbers.push(n);
  }

  return {
    isHallucinated: fakeNumbers.length > 0,
    sourceNumbers,
    replyNumbers,
    fakeNumbers,
  };
}

// 单次 sub-dispatch（mode 决定走 Promise.all 还是 for await）—— 本文件独有，
// 不抽到 lib/ 因为 plan.ts 也有类似逻辑但 ctx/logger 调用点不同；对比场景跑两份即可。
async function runOnce(
  calls: MockToolCall[],
  mode: "parallel" | "serial",
  dispatchStart: number,
): Promise<SubRun> {
  const tFuncStart = Date.now();
  logger.info(
    `│ 对照-runOnce[${mode}]`,
    "调用函数开始：runOnce",
    "为什么写这条日志：handlePostCompare 要把两份 SubRun 写进 ctx.body 交给页面 stats 区；每一份 SubRun 都从 runOnce 拿。当前：mode 决定走 Promise.all 还是 for await；记 dispatchStart 用于相对时间。",
    {
      入参: { mode, count: calls.length, toolCallIds: calls.map((c) => c.id) },
      __code: `// mode=parallel: Promise.all; mode=serial: for await`,
    },
  );

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
  const result: SubRun = {
    mode,
    totalMs: Date.now() - dispatchStart,
    results,
    timeline,
    mockReply: mode === "parallel" ? "5 月去东京 7 天机票约 ¥3500，平均气温 22°C，建议带薄外套和雨伞。" : "5 月去东京 7 天机票约 ¥5500，平均气温 25°C，建议带薄外套和雨伞。",
  };
  logger.info(
    `│ 对照-runOnce[${mode}]`,
    "调用函数结束：runOnce",
    "为什么写这条日志：route 要把 SubRun 写进 ctx.body 交给页面 stats 区；记 totalMs + okCount 便于加速比与编造检测。",
    {
      返回值: { mode: result.mode, totalMs: result.totalMs, okCount: result.results.filter(r => r.ok).length },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  return result;
}

// ── 路由 ──
export function mountCompareRoutes(router: Router): void {
  router.post("/api/compare", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const body = (ctx.request.body ?? {}) as { scenario?: unknown };
    const scenario = typeof body.scenario === "string" ? body.scenario : "";

    logger.info(
      "api.compare",
      "调用函数开始：handlePostCompare",
      "为什么写这条日志：route 只认这一层返回的对比包；里面两个 runOnce 是真正干活的那一层。当前：前端发来对比请求；服务端并发跑 parallel + serial 两次 sub-dispatch。",
      {
        入参: { scenario, bodyKeys: Object.keys(body) },
        __code: `const [parallelRun, serialRun] = await Promise.all([\n  runOnce(calls, "parallel", parallelStart),\n  runOnce(calls, "serial", serialStart),\n]);`,
      },
    );

    // §5.3.12 入参校验
    if (scenario !== "tokyo-may-7days") {
      logger.warn(
        "api.compare",
        "调用函数结束：handlePostCompare（校验拒绝）",
        "为什么写这条日志：scenario 必须是 tokyo-may-7days；其它都按 400 处理。",
        {
          返回值: { httpStatus: 400, error: "scenario 必须是 tokyo-may-7days" },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      ctx.status = 400;
      ctx.body = { error: "scenario 必须是 tokyo-may-7days" };
      return;
    }

    const calls: MockToolCall[] = planToolCalls(scenario);

    // ── 两个 sub-dispatch 各有独立 dispatchStart（互不干扰）──
    // 服务端并发两个独立 dispatch（不是同一次 dispatch 内的多 tool_call）
    const parallelStart = Date.now();
    const serialStart = Date.now();

    logger.info(
      "││ dispatch-compare",
      "调用循环开始：服务端并发两个 sub-dispatch",
      "为什么写这条日志：parallelStart + serialStart 各自起；结果后续聚合 speedup。",
      {
        第几轮: 1,
        总轮数: 2,
        本轮为什么是这些参数: { reason: "服务端并发两个独立 dispatch（不是同一次 dispatch 内的多 tool_call）" },
      },
    );
    const [parallelRun, serialRun] = await Promise.all([
      runOnce(calls, "parallel", parallelStart),
      runOnce(calls, "serial", serialStart),
    ]);
    logger.info(
      "││ dispatch-compare",
      "调用循环结束：两路跑完",
      "为什么写这条日志：记 speedup 与各自 totalMs + 编造检测结果便于核对。",
      {
        第几轮: 1,
        本轮结果: {
          parallelMs: parallelRun.totalMs,
          serialMs: serialRun.totalMs,
          okCount: parallelRun.results.filter(r => r.ok).length + serialRun.results.filter(r => r.ok).length,
        },
      },
    );

    const speedup = serialRun.totalMs / Math.max(parallelRun.totalMs, 1);
    const parallelHallucination = detectHallucination(parallelRun.mockReply, parallelRun.results);
    const serialHallucination = detectHallucination(serialRun.mockReply, serialRun.results);
    logger.info(
      "api.compare",
      "调用函数结束：handlePostCompare",
      "为什么写这条日志：route 要把对比包写进 ctx.body 交给页面 stats 区；含 parallelRun + serialRun + speedup + parallelHallucination + serialHallucination 五段。",
      {
        返回值: {
          parallelMs: parallelRun.totalMs,
          serialMs: serialRun.totalMs,
          speedup: Number(speedup.toFixed(2)),
          parallelHallucinated: parallelHallucination.isHallucinated,
          serialHallucinated: serialHallucination.isHallucinated,
        },
        耗时ms: Date.now() - tHandlerStart,
      },
    );

    ctx.body = { scenario, parallelRun, serialRun, speedup, parallelHallucination, serialHallucination };
  });
}