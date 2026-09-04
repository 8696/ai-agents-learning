/**
 * 职责：GET /health —— 只读环境 + 玩具表，不调模型、不算余弦。
 * 数据流：无 body → { ok, port, provider, model, hasKey, callsModel: false, tables }。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { llm, PORT } from "../lib/http/runtime-ctx.js";
import { CANDIDATES, EMBEDDING, QUERY_DEFAULT, TOKEN_ID, WORDS } from "../lib/vec/tables.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    logger.info(
      "路由-/health-入站",
      "GET /health 进入",
      "/health 只读环境 + 玩具表，不调模型；记下 provider/model 给后续排查定位用",
      { provider: llm?.provider ?? null, model: llm?.modelA ?? null, hasKey: Boolean(llm), port: PORT },
    );
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      callsModel: false,
      words: WORDS,
      queryDefault: QUERY_DEFAULT,
      candidates: CANDIDATES,
      tokenId: TOKEN_ID,
      embedding: EMBEDDING,
    };
    logger.info(
      "路由-/health-出站",
      "GET /health 响应拼好返回",
      "出站日志：玩具表大小、词表大小、查询默认，便于一眼核对",
      {
        wordsCount: WORDS.length,
        candidatesCount: CANDIDATES.length,
        queryDefault: QUERY_DEFAULT,
        tokenIdKeys: Object.keys(TOKEN_ID),
        embeddingKeys: Object.keys(EMBEDDING),
      },
    );
  });
}
