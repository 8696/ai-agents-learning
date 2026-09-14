/**
 * 职责：手动触发建库（POST /api/build-index）。
 * 数据流：POST → buildIndex(llm) → 把 6 个子块都转向量存内存；返 IndexStatus。
 * 为什么单独成文件：一个业务 URL 一个 route 文件（§5.3.8）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { buildIndex } from "../lib/corpus/vector-index.js";
import { getLlmOptional } from "../../../llm.js";
import { sendError } from "../lib/http/send-error.js";

export function mountBuildIndexRoutes(router: Router): void {
  router.post("/api/build-index", async (ctx: Context) => {
    const llm = getLlmOptional();
    if (!llm) {
      sendError(ctx, 503, {
        error: "NO_KEY",
        explain: "apps/.env 里当前模型服务商还没有密钥，无法建库。",
      });
      return;
    }
    try {
      const status = await buildIndex(llm);
      ctx.body = status;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 502, {
        error: "BUILD_INDEX_FAILED",
        explain: `建库失败：${message}`,
      });
    }
  });
}