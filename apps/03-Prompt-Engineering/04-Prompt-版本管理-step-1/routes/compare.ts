/**
 * 职责：POST /api/compare —— 薄封装：校验 → 对照流程 → 写 ctx.body。
 * 数据流：{ text, modes, prompts } → compareVersions → 两侧都失败才抬 HTTP 状态。
 * 本页只演示：同一 System、一字之差的两版 User 末尾。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostCompare 封装层）；
 *   校验挡下单独写 warn / info；子调用 compareVersions 内部已自带五条日志。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readCompareBody, requireLlm } from "../lib/http/request-guards.js";
import { compareVersions } from "../lib/flow/compare-versions.js";
import { logger } from "../lib/logger.js";

export function mountCompareRoutes(router: Router): void {
  router.post("/api/compare", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    logger.info(
      "api.compare",
      "调用函数开始：handlePostCompare",
      "为什么写这条日志：route 只认这一层返回的对照结构；里面 compareVersions 是真正干活的那一层。当前：前端发来对照请求；记 query 摘要便于复盘。",
      {
        入参: { bodyKeys: ctx.request.body && typeof ctx.request.body === "object" ? Object.keys(ctx.request.body as Record<string, unknown>) : [] },
        __code: `const currentLlm = requireLlm(ctx);\nconst body = readCompareBody(ctx);\nconst packed = await compareVersions({ llm: currentLlm, text: body.text, modes: body.modes, prompts: body.prompts });`,
      },
    );
    const currentLlm = requireLlm(ctx);
    if (!currentLlm) {
      logger.info(
        "api.compare",
        "调用函数结束：handlePostCompare",
        "为什么写这条日志：校验已回 503；route 不用再算 compareVersions。当前：requireLlm 已返回 null（校验在内部写过 error）。",
        {
          返回值: { httpStatus: 503, compareResult: null },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      return;
    }
    const body = readCompareBody(ctx);
    if (!body) {
      logger.info(
        "api.compare",
        "调用函数结束：handlePostCompare",
        "为什么写这条日志：校验已回 400；route 不用再算 compareVersions。当前：readCompareBody 已返回 null（校验在内部写过 warn）。",
        {
          返回值: { httpStatus: 400, compareResult: null },
          耗时ms: Date.now() - tHandlerStart,
        },
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
        "api.compare",
        "调用函数结束：handlePostCompare（失败）",
        "为什么写这条日志：两版都失败时把 HTTP 状态抬成上游码；记 status 便于前端显示「上游挂了」。当前：allFailed 已给出上游码 + error。",
        {
          返回值: { httpStatus: packed.allFailed.status, error: packed.allFailed.error, results: packed.results },
          耗时ms: Date.now() - tHandlerStart,
          错误: new Error(packed.allFailed.error),
        },
      );
      ctx.status = packed.allFailed.status;
      ctx.body = { error: packed.allFailed.error, results: packed.results };
      return;
    }

    logger.info(
      "api.compare",
      "调用函数结束：handlePostCompare",
      "为什么写这条日志：route 要把对照结构（input / versions / results）写进 ctx.body 交给页面 stats 区；记 results 数便于核对。当前：compareVersions 已返回，至少一版成功。",
      {
        返回值: { httpStatus: 200, resultsCount: packed.results.length, allFailed: false },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
    ctx.body = {
      input: packed.input,
      versions: packed.versions,
      results: packed.results,
    };
  });
}