/**
 * 职责：POST /api/chain —— 串行依赖链场景（对应 pages/chain.html）。
 * 数据流：
 *   POST { query, style } →
 *     ① 第一步 tool_call：search_doc(query) → 拿 hits
 *     ② 第二步 tool_call：summarize(content=上一步的 result, style) → 拿 summary
 *     ③ ctx.body = { query, style, steps: [{tool, ok, result, startMs, endMs}, ...], finalSummary }
 *
 * step-4 vs step-3：chain 链是**串行依赖**，**不**用 Promise.all —— 关键代码模式（详 MD 选型准则）。
 *   step-3 走 Promise.all 并发 3 个独立 Tool；本路由 await 顺序串两个依赖 Tool。
 *
 * 与 routes/compare.ts (step-3) 的关系：本路由服务"串行依赖"页面（pages/chain.html）；
 *   "对比"页面 (step-3 的 pages/compare.html) 走 step-3 的 routes/compare.ts。
 *   **页与接口 1:1**（§5.3.8）：chain 是独立场景 = 独立 route。
 *
 * 教学锚点（覆盖 MD 例子 5）：B 需要 A 的输出当参数 → await chain；不能 Promise.all。
 *
 * 日志（§5.3.16）：chain.received / chain.start / chain.done / chain.sent 都打。
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
  startMs: number;   // 相对 chain 开始的 ms
  endMs: number;
  durationMs: number;
  ok: boolean;
  result?: unknown;
  error?: string;
};

// ── 路由 ──
export function mountChainRoutes(router: Router): void {
  router.get("/api/tools", (ctx: Context) => {
    const meta = getToolsMeta();
    logger.info("tools.list", "GET /api/tools", "前端拉工具列表", { count: meta.length });
    ctx.body = { tools: meta };
  });

  router.post("/api/chain", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as { query?: unknown; style?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const style = typeof body.style === "string" ? body.style : "tech";

    logger.info("chain.received", "POST /api/chain", "前端发来串行依赖链请求；记 query + style", { query, style });

    // §5.3.12 入参闸门
    if (!query) {
      logger.warn("chain.bad-input", "query 空", "query 不能为空", { body });
      ctx.status = 400;
      ctx.body = { error: "query 不能为空" };
      return;
    }
    if (style !== "tech" && style !== "oneliner" && style !== "bullets") {
      logger.warn("chain.bad-input", "style 非法", "style 必须是 tech | oneliner | bullets", { style });
      ctx.status = 400;
      ctx.body = { error: "style 必须是 tech | oneliner | bullets" };
      return;
    }

    const chainStart = Date.now();
    const steps: StepTrace[] = [];
    let firstResult: unknown = null;

    // ── ① 第一步：search_doc（独立执行，路由层先 await 拿结果）──
    const calls1: MockToolCall[] = chainFirstCall(query);
    logger.info("chain.start", "第一步：search_doc", "路由层 hard-code 串行链 A → B；先 await search_doc", { call: calls1[0] });
    const call1 = calls1[0];
    {
      const startMs = Date.now() - chainStart;
      const r: ExecResult = await executeTool(call1.name, call1.arguments, call1.id);
      const endMs = Date.now() - chainStart;
      steps.push({
        tool: r.tool,
        tool_call_id: r.tool_call_id,
        startMs,
        endMs,
        durationMs: endMs - startMs,
        ok: r.ok,
        ...(r.ok ? { result: r.result } : { error: r.error }),
      });
      if (!r.ok) {
        logger.error("chain.step1.fail", "search_doc 失败", "第一步失败；短路返回不跑第二步（节省 + 业务正确）", { error: r.error });
        ctx.status = 502;
        ctx.body = { query, style, steps, finalSummary: null };
        return;
      }
      firstResult = r.result;
    }

    // ── ② 第二步：summarize（content = 上一步的 result；这是依赖链的物理形态）──
    const calls2: MockToolCall[] = chainSecondCall(firstResult, style);
    logger.info("chain.start", "第二步：summarize", "依赖链 B：用 A 的 result 当 content 参数", { call: calls2[0] });
    const call2 = calls2[0];
    {
      const startMs = Date.now() - chainStart;
      const r: ExecResult = await executeTool(call2.name, call2.arguments, call2.id);
      const endMs = Date.now() - chainStart;
      steps.push({
        tool: r.tool,
        tool_call_id: r.tool_call_id,
        startMs,
        endMs,
        durationMs: endMs - startMs,
        ok: r.ok,
        ...(r.ok ? { result: r.result } : { error: r.error }),
      });
      if (!r.ok) {
        logger.error("chain.step2.fail", "summarize 失败", "第二步失败", { error: r.error });
        ctx.status = 502;
        ctx.body = { query, style, steps, finalSummary: null };
        return;
      }
    }

    const totalMs = Date.now() - chainStart;
    const finalSummary = (steps[1].result as { summary?: string })?.summary ?? null;
    logger.info("chain.done", "链跑完", "记 totalMs + finalSummary 长度便于核对", { totalMs, finalLen: finalSummary?.length ?? 0 });

    ctx.body = { query, style, totalMs, steps, finalSummary };
    logger.info("chain.sent", "responded to client", "已返回", { status: 200 });
  });
}