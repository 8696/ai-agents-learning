/**
 * 职责：GET /api/corpus。把当前语料向量缓存「暴露」给前端。
 *       只回前 8 维 + L2 范数（norm），不全量回（动辄上千维）。
 *       没缓存（还没人跑过向量检索）→ cached=false，vectorPreview=[]。
 */
import Router from "@koa/router";
import { previewCorpusVectors } from "../lib/flow/bm25-vs-vector.js";
import { logger } from "../lib/logger.js";

export function mountCorpus(router: Router): void {
  router.get("/api/corpus", (ctx) => {
    const started = Date.now();
    logger.info(
      "corpus",
      "调用函数开始：GET /api/corpus",
      "为什么写这条日志：让页面看见「语料向量库」长什么样（前 8 维 + L2 norm）；cached=false 时说明还没人跑过向量检索。",
      { 入参: null, __code: "previewCorpusVectors()" },
    );
    const result = previewCorpusVectors();
    logger.info(
      "corpus",
      "调用函数结束：GET /api/corpus",
      "返回语料向量预览；前端把它画成一张「向量库一览」表。",
      { 返回值: result, 耗时ms: Date.now() - started },
    );
    ctx.body = { ok: true, result };
  });
}