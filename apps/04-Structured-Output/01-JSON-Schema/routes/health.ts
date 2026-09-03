/**
 * 职责：GET /health —— 只读环境 + JSON Schema literal + 三份样例，不 parse。
 * 数据流：无 body → { ok, port, provider, model, hasKey, callsModel: false, schema, samples }。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";
import {
  SAMPLE_BAD,
  SAMPLE_OK,
  SAMPLE_TRANSFORM,
  intentJsonSchema,
} from "../lib/schema/intent.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      callsModel: false,
      schema: intentJsonSchema,
      samples: {
        ok: SAMPLE_OK,
        bad: SAMPLE_BAD,
        transform: SAMPLE_TRANSFORM,
      },
    };
  });
}
