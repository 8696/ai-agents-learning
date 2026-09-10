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
 * 日志（§5.3.16）：调用函数 五条日志（handlePostPlan 封装层）；
 *   校验挡下单独写 warn；子调用 executeTool 内部已自带五条日志。
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
    const tHandlerStart = Date.now();
    const meta = getToolsMeta();
    logger.info(
      "api.tools",
      "调用函数开始：handleGetTools",
      "为什么写这条日志：route 只认这一层返回的 { tools }；里面 getToolsMeta 是真正干活的那一层。当前：前端 Tool Registry 面板拉一次；记 count 便于核对前后端 tool schema 是否一致。",
      {
        入参: { endpoint: "GET /api/tools" },
        __code: `ctx.body = { tools: getToolsMeta() };`,
      },
    );
    ctx.body = { tools: meta };
    logger.info(
      "api.tools",
      "调用函数结束：handleGetTools",
      "为什么写这条日志：route 要把 { tools } 写进 ctx.body 交给前端 Registry 面板。",
      {
        返回值: { count: meta.length },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  });

  router.post("/api/plan", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const body = (ctx.request.body ?? {}) as { scenario?: unknown; mode?: unknown };
    const scenario = typeof body.scenario === "string" ? body.scenario : "";
    const mode = typeof body.mode === "string" ? body.mode : "";

    logger.info(
      "api.plan",
      "调用函数开始：handlePostPlan",
      "为什么写这条日志：route 只认这一层返回的响应包；里面 planToolCalls + executeTool 是真正干活的那一层。当前：前端发来单跑请求；记 scenario + mode 决定走 Promise.all 还是 for await。",
      {
        入参: { scenario, mode, bodyKeys: Object.keys(body) },
        __code: `const calls = planToolCalls(scenario);\n// mode==parallel: Promise.all; mode==serial: for await`,
      },
    );

    // §5.3.12 入参校验：scenario/mode 非法 → 400（不抛异常）
    if (scenario !== "tokyo-may-7days") {
      logger.warn(
        "api.plan",
        "调用函数结束：handlePostPlan（校验拒绝）",
        "为什么写这条日志：scenario 必须是 tokyo-may-7days；其它都按 400 处理。warn 是「业务失败但能走通」的等级。",
        {
          返回值: { httpStatus: 400, error: "scenario 必须是 tokyo-may-7days" },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      ctx.status = 400;
      ctx.body = { error: "scenario 必须是 tokyo-may-7days" };
      return;
    }
    if (mode !== "parallel" && mode !== "serial") {
      logger.warn(
        "api.plan",
        "调用函数结束：handlePostPlan（校验拒绝）",
        "为什么写这条日志：mode 必须是 parallel | serial；其它都按 400 处理。",
        {
          返回值: { httpStatus: 400, error: "mode 必须是 parallel | serial" },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
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
      logger.info(
        "││ dispatch-plan",
        "调用循环开始：并行 dispatch（Promise.all）",
        "为什么写这条日志：Promise.all 让 3 个 handler 真的同时跑；3 个 sleep 同时倒数；gantt 时序图能看到 3 个 bar 的 startMs 几乎相同。",
        {
          第几轮: 1,
          总轮数: 1,
          本轮为什么是这些参数: {
            count: calls.length,
            toolCallIds: calls.map((c) => c.id),
            reason: "本路由单跑模式只触发一次并行批；calls 来自 planToolCalls(scenario)。",
          },
        },
      );
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
      logger.info(
        "││ dispatch-plan",
        "调用循环开始：串行 dispatch（for await）",
        "为什么写这条日志：串行 dispatch；上一个 handler 完成才跑下一个；总耗时 = sum。",
        {
          第几轮: 1,
          总轮数: 1,
          本轮为什么是这些参数: {
            count: calls.length,
            toolCallIds: calls.map((c) => c.id),
            reason: "串行对照；总耗时 = sum(handler sleeps)。",
          },
        },
      );
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
    logger.info(
      "││ dispatch-plan",
      "调用循环结束：dispatch 收尾",
      "为什么写这条日志：整批 tool_call 跑完；记 totalMs 便于和 gantt 视觉对账。",
      {
        第几轮: 1,
        本轮结果: { mode, totalMs, okCount: results.filter((r) => r.ok).length },
      },
    );

    // ── step-3 新增：mock 的"模型最终回复"（step-3 不调 LLM；按 mode 模拟"模型嫌慢编造结果"的踩坑）──
    //   mode=parallel：mockReply 用真实数字（3500 / 22）→ 检测 = 真实
    //   mode=serial  ：mockReply 编造（5500 / 25 都不在 tool_result 里）→ 检测 = 编造
    //   这是 MD 需求 2 验收「模型最终回复是否编造」的可观察演示。
    const mockReply = mode === "parallel"
      ? "5 月去东京 7 天机票约 ¥3500，平均气温 22°C，建议带薄外套和雨伞。"
      : "5 月去东京 7 天机票约 ¥5500，平均气温 25°C，建议带薄外套和雨伞。";

    ctx.body = { scenario, mode, totalMs, results, timeline, mockReply };
    logger.info(
      "api.plan",
      "调用函数结束：handlePostPlan",
      "为什么写这条日志：route 要把响应包写进 ctx.body 交给页面 stats 区；含 mockReply 便于前端展示 + 编造检测。",
      {
        返回值: { status: 200, resultsCount: results.length, timelineCount: timeline.length, mode, mockReply },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  });
}