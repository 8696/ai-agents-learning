/**
 * 职责：左栏「空系统提示词 + RAG」端点（POST /api/rag-empty）。校验入参 → 调本步核心（promptVariant="empty"）→ 写 ctx.body。
 * 一个业务 URL 一个 route 文件（§5.3.8）。
 *
 * 与 routes/rag-fewshot.ts 对照：同一事实层 / 不同 system（空 vs 范例）；差异只来自系统提示词。
 *
 * 入参支持 forceError=true —— 用于 §5.3.2 #2「第二类错误」演示：模拟上游 5xx，
 *   让 #status-pill 变 ❌ + 卡片显示红字「演示上游失败：HTTP 500」。默认 false。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { answerWithRag } from "../lib/flow/answer-with-rag.js";
import { logger } from "../lib/logger.js";

export function mountRagEmptyRoute(router: Router): void {
  router.post("/api/rag-empty", async (ctx: Context) => {
    const t0 = Date.now();
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    logger.info(
      "server.rag-empty",
      "调用函数开始：/api/rag-empty",
      "为什么写这条日志：路由层入口；下一步交给本步核心（promptVariant=empty）。",
      {
        入参: body,
        __code: "const result = await answerWithRag({...body, promptVariant: 'empty'});",
      },
    );
    try {
      // ── 第二类错误：演示上游失败（§5.3.2 #2）──
      if (body.forceError === true) {
        logger.warn(
          "server.rag-empty",
          "调用函数结束：/api/rag-empty（演示上游失败）",
          "为什么写这条日志：让学习者看见左栏「演示上游失败」按钮触发时是这一条路径走的。" +
            " 当前：forceError=true 已生效；下一步抛 5xx。",
          { 返回值: { status: 500 }, 耗时ms: Date.now() - t0 },
        );
        ctx.status = 500;
        ctx.body = { error: "演示上游失败（forceError=true）：模拟上游大模型 5xx 响应" };
        return;
      }
      const result = await answerWithRag({ ...body, promptVariant: "empty" });
      logger.info(
        "server.rag-empty",
        "调用函数结束：/api/rag-empty",
        "为什么写这条日志：路由层把结果交给浏览器（左栏：空提示词 + RAG，看自由发挥的口吻）。",
        { 返回值: result, 耗时ms: Date.now() - t0 },
      );
      ctx.body = result;
    } catch (err: unknown) {
      logger.error(
        "server.rag-empty",
        "调用函数结束：/api/rag-empty（失败）",
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