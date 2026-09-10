/**
 * 职责：POST /api/classify —— 薄封装：校验 → 对照流程 → 写 ctx.body。
 * 数据流：{ text, modes } → classifyModes → 两侧都失败才把 HTTP 状态抬成上游码。
 * 本页只演示：同一句评价、同一 System，Zero（无样例）vs Few（4 对假对话）。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostClassify 封装层）；
 *   校验挡下单独写 warn / info；子调用 classifyModes 内部已自带五条日志。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readClassifyBody, requireLlm } from "../lib/http/request-guards.js";
import { classifyModes } from "../lib/flow/classify-modes.js";
import { logger } from "../lib/logger.js";

export function mountClassifyRoutes(router: Router): void {
  router.post("/api/classify", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const currentLlm = requireLlm(ctx);
    if (!currentLlm) {
      logger.info(
        "api.classify",
        "POST /api/classify 被无 Key 校验挡掉",
        "为什么写这条日志：服务端兜底；没 Key 就别让上游 SDK 抛一句读不懂的错。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "POST /api/classify" },
      );
      return;
    }
    const body = readClassifyBody(ctx);
    if (!body) {
      logger.warn(
        "api.classify",
        "POST /api/classify 被入参校验挡掉",
        "为什么写这条日志：校验挡下没花模型额度也没走到 classifyModes；记 reason 便于复盘。当前：body 不合法。",
        { endpoint: "POST /api/classify" },
      );
      return;
    }

    logger.info(
      "api.classify",
      "调用函数开始：handlePostClassify",
      "为什么写这条日志：route 只认这一层返回的 { results }；里面 classifyModes 是真正干活的那一层（并发跑 Zero / Few 两个 classifyOne）。当前：校验全过，即将交给 classifyModes。",
      {
        入参: { textPreview: body.text.slice(0, 50), textLen: body.text.length, modes: body.modes },
        __code: `const packed = await classifyModes({ llm: currentLlm, text: body.text, modes: body.modes });`,
      },
    );

    const packed = await classifyModes({
      llm: currentLlm,
      text: body.text,
      modes: body.modes,
    });

    // 两侧都失败才抬状态：一侧成功一侧失败仍是 200，好让对照页看得见「哪一侧挂了」。
    if (packed.allFailed) {
      ctx.status = packed.allFailed.status;
      ctx.body = { error: packed.allFailed.error, results: packed.results };
      logger.error(
        "api.classify",
        "调用函数结束：handlePostClassify（失败）",
        "为什么写这条日志：两侧都失败时把 HTTP 状态抬成上游码；记 status 便于前端显示「上游挂了」。当前：allFailed 已给出上游码 + error。",
        {
          返回值: { httpStatus: packed.allFailed.status, error: packed.allFailed.error, results: packed.results },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      return;
    }

    ctx.body = {
      product: packed.product,
      system: packed.system,
      input: packed.input,
      results: packed.results,
    };
    logger.info(
      "api.classify",
      "调用函数结束：handlePostClassify",
      "为什么写这条日志：route 要把对照结构（product / system / input / results）写进 ctx.body 交给页面 stats 区。当前：classifyModes 已返回，至少一侧 ok。",
      {
        返回值: {
          resultsCount: packed.results.length,
          resultsSummary: packed.results.map((r) => ({ mode: r.mode, ok: r.ok, formatValid: "formatValid" in r ? r.formatValid : null })),
        },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  });
}