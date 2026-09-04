/**
 * 职责：POST /api/compare —— 薄封装：闸门 → 对照流程 → 写 ctx.body。
 * 数据流：{ text, modes, prompts } → compareVersions → 两侧都失败才抬 HTTP 状态。
 * 本页只演示：同一 System、一字之差的两版 User 末尾。
 *
 * 日志（§5.3.16）：compare.received / compare.bad-input / compare.sent。
 *   编排层 / LLM 层日志在 lib/flow/* 里打。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readCompareBody, requireLlm } from "../lib/http/request-guards.js";
import { compareVersions } from "../lib/flow/compare-versions.js";
import { logger } from "../lib/logger.js";

export function mountCompareRoutes(router: Router): void {
  router.post("/api/compare", async (ctx: Context) => {
    logger.info(
      "compare.received",
      "POST /api/compare",
      "前端发来对照请求；记 query 摘要（modes / 两版 suffix 长度）便于复现与排查",
      {
        bodyKeys: ctx.request.body && typeof ctx.request.body === "object" ? Object.keys(ctx.request.body as Record<string, unknown>) : [],
      },
    );
    const currentLlm = requireLlm(ctx);
    if (!currentLlm) return;
    const body = readCompareBody(ctx);
    if (!body) {
      logger.warn(
        "compare.bad-input",
        "参数错误",
        "Zod 校验失败（text 空 / 超长 / modes 不在 v1,v2）；这是业务失败不是 LLM 错，走 400 不让对照浪费 token",
        { bodyPreview: ctx.request.body },
      );
      return;
    }

    const packed = await compareVersions({
      llm: currentLlm,
      text: body.text,
      modes: body.modes,
      prompts: body.prompts,
    });

    if (packed.allFailed) {
      logger.error(
        "compare.all-failed",
        "两版都失败 → 502",
        "两版 LLM 调用全挂；502 回前端，记 status + error 便于排错（多半是 provider Key / 限流 / 网络）",
        { status: packed.allFailed.status, error: packed.allFailed.error },
      );
      ctx.status = packed.allFailed.status;
      ctx.body = { error: packed.allFailed.error, results: packed.results };
      return;
    }

    logger.info(
      "compare.sent",
      "responded to client",
      "已返回给前端；记 status + results 数便于核对（allFailed=null 表示至少一版成功）",
      { status: 200, resultsCount: packed.results.length, allFailed: false },
    );
    ctx.body = {
      input: packed.input,
      versions: packed.versions,
      results: packed.results,
    };
  });
}
