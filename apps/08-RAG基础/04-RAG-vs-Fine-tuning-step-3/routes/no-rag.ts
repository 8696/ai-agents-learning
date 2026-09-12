/**
 * 职责：左栏「不接 RAG（model only · 无材料 · 无出处）」端点（POST /api/no-rag）。校验入参 → 调本步核心 2 → 写 ctx.body。
 * 一个业务 URL 一个 route 文件（§5.3.8）。
 *
 * 入参支持 forceError=true —— 用于 §5.3.2 #2「第二类错误」演示：模拟上游 5xx，让
 *   #status-pill 变 ❌ + 左栏卡片显示红字「演示后端错误：HTTP 500」。默认 false。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { answerWithoutRag } from "../lib/flow/answer-without-rag.js";
import { logger } from "../lib/logger.js";

const inputSchema = (v: unknown) => {
  const obj = (typeof v === "object" && v !== null) ? (v as Record<string, unknown>) : {};
  return {
    question: typeof obj.question === "string" ? obj.question : "",
    forceError: Boolean(obj.forceError),
  };
};

export function mountNoRagRoute(router: Router): void {
  router.post("/api/no-rag", async (ctx: Context) => {
    const t0 = Date.now();
    const parsed = inputSchema(ctx.request.body);
    logger.info(
      "server.no-rag",
      "调用函数开始：/api/no-rag",
      "为什么写这条日志：路由层入口；下一步交给本步核心 2（answer-without-rag）。",
      {
        入参: parsed,
        __code: "const result = await answerWithoutRag(ctx.request.body);",
      },
    );
    try {
      // ── 第二类错误：演示后端 5xx（§5.3.2 #2）──
      if (parsed.forceError) {
        logger.warn(
          "server.no-rag",
          "调用函数结束：/api/no-rag（演示后端 5xx）",
          "为什么写这条日志：让学习者看见左栏「演示后端 5xx」按钮触发时是这一条路径走的。" +
            " 当前：forceError=true 已生效；下一步抛 5xx。",
          { 返回值: { status: 500 }, 耗时ms: Date.now() - t0 },
        );
        ctx.status = 500;
        ctx.body = {
          error: "演示后端 5xx（forceError=true）：模拟上游大模型 5xx 响应",
        };
        return;
      }
      const result = await answerWithoutRag(ctx.request.body);
      logger.info(
        "server.no-rag",
        "调用函数结束：/api/no-rag",
        "为什么写这条日志：路由层把结果交给浏览器（左栏会看见 answer + 来源：无）。",
        { 返回值: result, 耗时ms: Date.now() - t0 },
      );
      ctx.body = result;
    } catch (err: unknown) {
      logger.error(
        "server.no-rag",
        "调用函数结束：/api/no-rag（失败）",
        "为什么写这条日志：要让学习者看到左栏失败时是哪个端点挂了。",
        {
          返回值: {
            error:
              err instanceof Error
                ? { name: err.name, message: err.message, stack: err.stack }
                : String(err),
          },
          耗时ms: Date.now() - t0,
        },
      );
      ctx.status = err instanceof Error && err.message.includes("问题不能为空") ? 400 : 500;
      ctx.body = { error: err instanceof Error ? err.message : String(err) };
    }
  });
}