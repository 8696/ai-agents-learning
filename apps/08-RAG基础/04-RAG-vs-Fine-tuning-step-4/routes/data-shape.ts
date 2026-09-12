/**
 * 职责：GET /api/data-shape —— 返回本 step 的「文档段落」vs「问答对」两套示例数据。
 * 数据流：前端 fetch("/api/data-shape") → ctx.body → 渲染两栏对照。
 *
 * 教学点（需求 10）：检索增强生成喂「文档」，微调喂「问答对」 —— 长得完全不一样。
 *   本步不调 LLM（§5.3.0 例外「纯协议形状 / UI 渲染层演示」）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { DOC_CORPUS } from "../lib/data-shape/doc-corpus.js";
import { QA_CORPUS } from "../lib/data-shape/qa-corpus.js";
import { logger } from "../lib/logger.js";

export function mountDataShapeRoute(router: Router): void {
  router.get("/api/data-shape", (ctx: Context) => {
    const body = {
      docs: DOC_CORPUS,
      qas: QA_CORPUS,
    };
    logger.info(
      "│ 调用函数-/api/data-shape",
      "调用函数结束：/api/data-shape",
      "为什么写这条日志：前端拉对照数据；本页不调 LLM，只是把两份语料原样返回给浏览器渲染。",
      { 返回值: { docCount: DOC_CORPUS.length, qaCount: QA_CORPUS.length }, 耗时ms: 0 },
    );
    ctx.body = body;
  });
}