/**
 * 职责：右栏「带范例系统提示词 + RAG」端点（POST /api/rag-fewshot）。校验入参 → 调本步核心（promptVariant="fewshot"）→ 写 ctx.body。
 * 一个业务 URL 一个 route 文件（§5.3.8）。
 *
 * 与 routes/rag-empty.ts 对照：同一事实层 / 不同 system（空 vs 范例）；右侧更接近品牌口吻约定。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { answerWithRag } from "../lib/flow/answer-with-rag.js";
import { logger } from "../lib/logger.js";

export function mountRagFewshotRoute(router: Router): void {
  router.post("/api/rag-fewshot", async (ctx: Context) => {
    const t0 = Date.now();
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    logger.info(
      "server.rag-fewshot",
      "调用函数开始：/api/rag-fewshot",
      "为什么写这条日志：路由层入口；下一步交给本步核心（promptVariant=fewshot）。",
      {
        入参: body,
        __code: "const result = await answerWithRag({...body, promptVariant: 'fewshot'});",
      },
    );
    try {
      // ── 第二类错误：演示后端 5xx（§5.3.2 #2）──
      if (body.forceError === true) {
        logger.warn(
          "server.rag-fewshot",
          "调用函数结束：/api/rag-fewshot（演示后端 5xx）",
          "为什么写这条日志：让学习者看见「演示后端 5xx」按钮触发时是这一条路径走的。" +
            " 当前：forceError=true 已生效；下一步抛 5xx。",
          { 返回值: { status: 500 }, 耗时ms: Date.now() - t0 },
        );
        ctx.status = 500;
        ctx.body = { error: "演示后端 5xx（forceError=true）：模拟上游大模型 5xx 响应" };
        return;
      }
      const result = await answerWithRag({ ...body, promptVariant: "fewshot" });
      logger.info(
        "server.rag-fewshot",
        "调用函数结束：/api/rag-fewshot",
        "为什么写这条日志：路由层把结果交给浏览器（右栏：范例口吻 + RAG，看品牌口吻对照）。",
        { 返回值: result, 耗时ms: Date.now() - t0 },
      );
      ctx.body = result;
    } catch (err: unknown) {
      logger.error(
        "server.rag-fewshot",
        "调用函数结束：/api/rag-fewshot（失败）",
        "为什么写这条日志：要让学习者看到右栏失败时是哪个端点挂了。",
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