/**
 * 职责：POST /api/compare —— 薄封装：闸门 → 对照流程 → 写 ctx.body。
 * 数据流：{ text, modes, prompts } → compareVersions → 两侧都失败才抬 HTTP 状态。
 * 本页只演示：同一 System、一字之差的两版 User 末尾。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readCompareBody, requireLlm } from "../lib/http/request-guards.js";
import { compareVersions } from "../lib/flow/compare-versions.js";

export function mountCompareRoutes(router: Router): void {
  router.post("/api/compare", async (ctx: Context) => {
    const currentLlm = requireLlm(ctx);
    if (!currentLlm) return;
    const body = readCompareBody(ctx);
    if (!body) return;

    const packed = await compareVersions({
      llm: currentLlm,
      text: body.text,
      modes: body.modes,
      prompts: body.prompts,
    });

    if (packed.allFailed) {
      ctx.status = packed.allFailed.status;
      ctx.body = { error: packed.allFailed.error, results: packed.results };
      return;
    }

    ctx.body = {
      input: packed.input,
      versions: packed.versions,
      results: packed.results,
    };
  });
}
