/**
 * 职责：GET /health —— 只读环境 + 玩具表，不调模型、不算余弦。
 * 数据流：无 body → { ok, port, provider, model, hasKey, callsModel: false, tables }。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";
import { CANDIDATES, EMBEDDING, QUERY_DEFAULT, TOKEN_ID, WORDS } from "../lib/vec/tables.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
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
  });
}
