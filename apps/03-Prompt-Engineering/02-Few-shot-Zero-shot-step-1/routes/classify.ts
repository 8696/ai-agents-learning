/**
 * 职责：POST /api/classify —— 薄封装：闸门 → 对照流程 → 写 ctx.body。
 * 数据流：{ text, modes } → classifyModes → 两侧都失败才把 HTTP 状态抬成上游码。
 * 本页只演示：同一句评价、同一 System，Zero（无样例）vs Few（4 对假对话）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readClassifyBody, requireLlm } from "../lib/http/request-guards.js";
import { classifyModes } from "../lib/flow/classify-modes.js";

export function mountClassifyRoutes(router: Router): void {
  router.post("/api/classify", async (ctx: Context) => {
    const currentLlm = requireLlm(ctx);
    if (!currentLlm) return;
    const body = readClassifyBody(ctx);
    if (!body) return;

    const packed = await classifyModes({
      llm: currentLlm,
      text: body.text,
      modes: body.modes,
    });

    // 两侧都失败才抬状态：一侧成功一侧失败仍是 200，好让对照页看得见「哪一侧挂了」。
    if (packed.allFailed) {
      ctx.status = packed.allFailed.status;
      ctx.body = { error: packed.allFailed.error, results: packed.results };
      return;
    }

    ctx.body = {
      product: packed.product,
      system: packed.system,
      input: packed.input,
      results: packed.results,
    };
  });
}
