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
 * 日志（§5.3.16）：调用函数 五条日志（handlePostChain 封装层）；
 *   校验挡下单独写 warn；子调用 executeTool 内部已自带五条日志。
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

  router.post("/api/chain", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const body = (ctx.request.body ?? {}) as { query?: unknown; style?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const style = typeof body.style === "string" ? body.style : "tech";

    logger.info(
      "api.chain",
      "调用函数开始：handlePostChain",
      "为什么写这条日志：route 只认这一层返回的响应包；里面 executeTool 是真正干活的那一层。当前：前端发来串行依赖链请求；记 query + style。",
      {
        入参: { queryPreview: query.slice(0, 60), queryLen: query.length, style, bodyKeys: Object.keys(body) },
        __code: `// step-1: await search_doc(query)\n// step-2: await summarize(search_doc.result, style)`,
      },
    );

    // §5.3.12 入参校验
    if (!query) {
      logger.warn(
        "api.chain",
        "调用函数结束：handlePostChain（校验拒绝）",
        "为什么写这条日志：query 不能为空；走 400 不让 round-1 浪费 token。",
        {
          返回值: { httpStatus: 400, error: "query 不能为空" },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      ctx.status = 400;
      ctx.body = { error: "query 不能为空" };
      return;
    }
    if (style !== "tech" && style !== "oneliner" && style !== "bullets") {
      logger.warn(
        "api.chain",
        "调用函数结束：handlePostChain（校验拒绝）",
        "为什么写这条日志：style 必须是 tech | oneliner | bullets；其它都按 400 处理。",
        {
          返回值: { httpStatus: 400, error: "style 必须是 tech | oneliner | bullets" },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      ctx.status = 400;
      ctx.body = { error: "style 必须是 tech | oneliner | bullets" };
      return;
    }

    const chainStart = Date.now();
    const steps: StepTrace[] = [];
    let firstResult: unknown = null;

    // ── ① 第一步：search_doc（独立执行，路由层先 await 拿结果）──
    const calls1: MockToolCall[] = chainFirstCall(query);
    logger.info(
      "││ dispatch-chain",
      "调用循环开始：第 1 轮 / 共 2 轮（chain A）",
      "为什么写这条日志：路由层 hard-code 串行链 A → B；先 await search_doc。",
      {
        第几轮: 1,
        总轮数: 2,
        本轮为什么是这些参数: { call: calls1[0] },
      },
    );
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
        logger.info(
          "││ dispatch-chain",
          "调用循环结束：第 1 轮（失败短路）",
          "为什么写这条日志：第一步失败；短路返回不跑第二步（节省 + 业务正确）。",
          {
            第几轮: 1,
            本轮结果: { ok: false, error: r.error },
          },
        );
        logger.error(
          "api.chain",
          "调用函数结束：handlePostChain（step-1 失败）",
          "为什么写这条日志：第一步失败；502 返回前端；记 error + steps 便于排错。",
          {
            返回值: { httpStatus: 502, finalSummary: null },
            耗时ms: Date.now() - tHandlerStart,
            错误: new Error(r.error),
          },
        );
        ctx.status = 502;
        ctx.body = { query, style, steps, finalSummary: null };
        return;
      }
      firstResult = r.result;
    }
    logger.info(
      "││ dispatch-chain",
      "调用循环结束：第 1 轮",
      "为什么写这条日志：步骤 1 已返；正常路径会拿此 result 当 summarize.content。",
      {
        第几轮: 1,
        本轮结果: { ok: true, hasHits: Boolean((firstResult as { hits?: unknown[] })?.hits) },
      },
    );

    // ── ② 第二步：summarize（content = 上一步的 result；这是依赖链的物理形态）──
    const calls2: MockToolCall[] = chainSecondCall(firstResult, style);
    logger.info(
      "││ dispatch-chain",
      "调用循环开始：第 2 轮 / 共 2 轮（chain B）",
      "为什么写这条日志：依赖链 B：用 A 的 result 当 content 参数。",
      {
        第几轮: 2,
        总轮数: 2,
        本轮为什么是这些参数: { call: calls2[0], contentFromStep1: Boolean(firstResult) },
      },
    );
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
        logger.info(
          "││ dispatch-chain",
          "调用循环结束：第 2 轮（失败短路）",
          "为什么写这条日志：第二步失败；记录错误并短路返回。",
          {
            第几轮: 2,
            本轮结果: { ok: false, error: r.error },
          },
        );
        logger.error(
          "api.chain",
          "调用函数结束：handlePostChain（step-2 失败）",
          "为什么写这条日志：第二步失败；502 返回前端；记 error + steps 便于排错。",
          {
            返回值: { httpStatus: 502, finalSummary: null },
            耗时ms: Date.now() - tHandlerStart,
            错误: new Error(r.error),
          },
        );
        ctx.status = 502;
        ctx.body = { query, style, steps, finalSummary: null };
        return;
      }
    }
    logger.info(
      "││ dispatch-chain",
      "调用循环结束：第 2 轮",
      "为什么写这条日志：步骤 2 完成；记录 finalSummary 长度便于核对。",
      {
        第几轮: 2,
        本轮结果: { ok: true, finalLen: (steps[1].result as { summary?: string })?.summary?.length ?? 0 },
      },
    );

    const totalMs = Date.now() - chainStart;
    const finalSummary = (steps[1].result as { summary?: string })?.summary ?? null;
    logger.info(
      "api.chain",
      "调用函数结束：handlePostChain",
      "为什么写这条日志：route 要把响应包写进 ctx.body 交给页面 stats 区；含 finalSummary 便于核对。",
      {
        返回值: { status: 200, totalMs, finalLen: finalSummary?.length ?? 0, stepsCount: steps.length },
        耗时ms: Date.now() - tHandlerStart,
      },
    );

    ctx.body = { query, style, totalMs, steps, finalSummary };
  });
}