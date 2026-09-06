/**
 * 职责：POST /api/chain-bad —— 串行依赖链的 **Promise.all 反例**（对应 pages/chain-bad.html）。
 * 数据流：
 *   POST { query, style } →
 *     ① 同时准备 2 个 tool_call：search_doc(query) + summarize(content=undefined, style)
 *     ② Promise.all 并发执行（**反例**：B 不等 A 完成就启动）
 *     ③ summarize 拿到 content=undefined → Zod schema z.unknown() 通过 → handler 返 (未知 query) + hits=[]
 *     ④ ctx.body = { query, style, steps, finalSummary, totalMs, antiPattern: true, summaryNote }
 *
 * 教学锚点（覆盖 MD 需求 3 反例可跑）：
 *   - 演示「独立 IO 写 Promise.all 看起来快，但**有数据依赖时 B 拿 undefined**」这一踩坑
 *   - 反例 vs 正例：
 *     - 正例（routes/chain.ts）：await search_doc → await summarize(content=A.result) → summary 有 hits
 *     - 反例（本路由）：Promise.all 两个并发起步 → summarize 收到 content=undefined → summary 缺数据
 *   - gantt 时序图：2 bar 同时起步（与正例的"顺序堆叠"形成对比）
 *   - final summary 标红 ❌（content=undefined → query="(未知 query)" / hits=0）
 *
 * 与 routes/chain.ts 的关系：本路由服务"反例"页面（pages/chain-bad.html）；
 *   chain 页面（pages/chain.html）走 routes/chain.ts。**页与接口 1:1**（§5.3.8）。
 *
 * 日志（§5.3.16）：chain-bad.received / bad.dispatch / bad.step1.done / bad.step2.done / bad.done / bad.sent 都打。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import {
  executeTool,
  getToolsMeta,
  chainFirstCall,
  chainSecondCall,
  type ExecResult,
  type MockToolCall,
} from "../lib/tools/registry.js";
import { logger } from "../lib/logger.js";

type StepTrace = {
  tool: string;
  tool_call_id: string;
  startMs: number;   // 相对 dispatch 开始的 ms
  endMs: number;
  durationMs: number;
  ok: boolean;
  result?: unknown;
  error?: string;
};

// ── 路由 ──
export function mountChainBadRoutes(router: Router): void {
  router.get("/api/tools", (ctx: Context) => {
    const meta = getToolsMeta();
    logger.info("tools.list", "GET /api/tools", "前端拉工具列表", { count: meta.length });
    ctx.body = { tools: meta };
  });

  router.post("/api/chain-bad", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as { query?: unknown; style?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const style = typeof body.style === "string" ? body.style : "tech";

    logger.info("chain-bad.received", "POST /api/chain-bad", "前端发来反例请求；记 query + style。注意：本路由故意把 summarize.content 写 undefined，演示 Promise.all 拿不到上游输出的踩坑", {
      query, style,
    });

    // §5.3.12 入参闸门
    if (!query) {
      logger.warn("chain-bad.bad-input", "query 空", "query 不能为空", { body });
      ctx.status = 400;
      ctx.body = { error: "query 不能为空" };
      return;
    }
    if (style !== "tech" && style !== "oneliner" && style !== "bullets") {
      logger.warn("chain-bad.bad-input", "style 非法", "style 必须是 tech | oneliner | bullets", { style });
      ctx.status = 400;
      ctx.body = { error: "style 必须是 tech | oneliner | bullets" };
      return;
    }

    const dispatchStart = Date.now();
    const steps: StepTrace[] = [];

    // ── 决定 2 个 tool_call（同时准备，不等 search_doc 跑完）──
    // 反例关键：summarize.content 直接传 undefined，不依赖 search_doc 的 result
    const calls1: MockToolCall[] = chainFirstCall(query);
    const calls2: MockToolCall[] = chainSecondCall(undefined, style);
    logger.warn("chain-bad.dispatch", "Promise.all 并发两个 tool_call", "❌ 反例模式：B 不等 A 完成就启动；summarize.content=undefined；演示「有依赖链用 Promise.all → B 拿 undefined」的踩坑", {
      callA: calls1[0],
      callB: calls2[0],
      callB_content: calls2[0].arguments.content,  // undefined —— 反例证据
    });

    // ── ❌ 反例：Promise.all 并发（路由层 hard-code A → B 但错误用并发）──
    //   真实场景下这一步会拿 [searchDocResult, summarizeResult]
    //   但 summarize 的 content 已经在上面传 undefined → handler 返 (未知 query) + hits=[]
    const promises = calls1.map((c1) => {
      const startMs = Date.now() - dispatchStart;
      return executeTool(c1.name, c1.arguments, c1.id).then((r: ExecResult) => {
        const endMs = Date.now() - dispatchStart;
        steps.push({
          tool: r.tool,
          tool_call_id: r.tool_call_id,
          startMs,
          endMs,
          durationMs: endMs - startMs,
          ok: r.ok,
          ...(r.ok ? { result: r.result } : { error: r.error }),
        });
        logger.info("chain-bad.step1.done", "search_doc 完成", "步骤 1 已返；正常路径会拿此 result 当 summarize.content，但本反例路径已提前把 summarize.content 写成 undefined", {
          ok: r.ok, hasHits: r.ok ? Boolean((r.result as { hits?: unknown[] })?.hits) : false,
        });
        return r;
      });
    });

    const promiseB = (() => {
      const call2 = calls2[0];
      const startMs = Date.now() - dispatchStart;
      return executeTool(call2.name, call2.arguments, call2.id).then((r: ExecResult) => {
        const endMs = Date.now() - dispatchStart;
        steps.push({
          tool: r.tool,
          tool_call_id: r.tool_call_id,
          startMs,
          endMs,
          durationMs: endMs - startMs,
          ok: r.ok,
          ...(r.ok ? { result: r.result } : { error: r.error }),
        });
        logger.info("chain-bad.step2.done", "summarize 完成（反例）", "步骤 2 完成；但 content=undefined → summary 缺数据（hits=0 / query='未知 query'）", {
          ok: r.ok,
          summaryQuery: r.ok ? (r.result as { query?: string })?.query : undefined,
          summaryHits: r.ok ? ((r.result as { hits?: unknown[] })?.hits?.length ?? 0) : 0,
        });
        return r;
      });
    })();

    const settled = await Promise.all([...promises, promiseB]);

    // 整理：step1 = searchDoc，step2 = summarize
    const step1 = settled.find((r) => r.tool === "search_doc");
    const step2 = settled.find((r) => r.tool === "summarize");
    const finalSummary = (step2?.ok ? (step2.result as { summary?: string })?.summary : null) ?? null;

    const totalMs = Date.now() - dispatchStart;
    logger.info("chain-bad.done", "反例链跑完", "Promise.all 并发 ≈ max(handler sleeps) = 80ms；总耗时比正例串行 130ms 短，但 summary 缺数据（❌ 反例代价）", {
      totalMs, finalQuery: finalSummary ? "(未知 query)" : "(无 summary)", hasHits: false,
    });

    ctx.body = {
      query,
      style,
      totalMs,
      steps,
      finalSummary,
      antiPattern: true,
      summaryNote: "❌ 反例：Promise.all 让 summarize 拿到 content=undefined → summary 缺数据（hits=0 / query='(未知 query)'）。与正例 routes/chain.ts 对比：正例 await 串行 → summarize 拿到 search_doc 的 hits → summary 有内容。",
    };
    logger.info("chain-bad.sent", "responded to client", "已返回；含 antiPattern: true + summaryNote 便于前端渲染 ❌ 警告", { status: 200 });
  });
}
