/**
 * 职责：两个 encode 端点 —— 自定义一段 / 固定中英对照。
 * 数据流：校验 → encodeText → ctx.body。全程本地，不调 LLM。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostEncode / handlePostCompare 封装层）；
 *   校验挡下（Zod 失败 / 空串）已在 lib/http/request-guards.ts 写 warn；
 *   本文件只补 entry / exit 的 info 横幅 + 子调用五条日志在 lib/tokenize/encode-text.ts。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readEncodeBody } from "../lib/http/request-guards.js";
import { encodeText } from "../lib/tokenize/encode-text.js";
import { CHINESE, ENGLISH } from "../lib/tokenize/presets.js";
import { logger } from "../lib/logger.js";

export function mountEncodeRoutes(router: Router): void {
  router.post("/api/encode", (ctx: Context) => {
    const tHandlerStart = Date.now();
    logger.info(
      "api.encode",
      "调用函数开始：handlePostEncode",
      "为什么写这条日志：route 只认这一层返回的 EncodeResult；里面那次才是「Token 化」真正干活的部分（看「调用函数开始：encodeText」）。当前：POST /api/encode 收到请求，即将跑 readEncodeBody → encodeText。",
      {
        入参: {
          textLen: (ctx.request.body as { text?: string } | undefined)?.text?.length ?? 0,
        },
        __code: `const body = readEncodeBody(ctx);\nconst result = encodeText(body.text);`,
      },
    );

    const body = readEncodeBody(ctx);
    if (!body) {
      logger.info(
        "api.encode",
        "调用函数结束：handlePostEncode",
        "为什么写这条日志：校验已回 400，route 不用再算 EncodeResult。当前：readEncodeBody 已返回 null（校验在内部写过 warn），route 直接 return。",
        {
          返回值: { httpStatus: 400, encodeResult: null },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      return;
    }
    const result = encodeText(body.text);
    ctx.body = result;

    logger.info(
      "api.encode",
      "调用函数结束：handlePostEncode",
      "为什么写这条日志：route 要把 EncodeResult 写进 ctx.body 交给页面 stats 区，和 encodeText 的结束 log 互为对照。当前：EncodeResult 已落 ctx.body。",
      {
        返回值: {
          charCount: result.charCount,
          tokenCount: result.tokenCount,
          previewIds: result.previewIds,
          vocab: result.vocab,
        },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  });

  // 对照端点不收 body：样本来自 presets，避免页面自己写死两句对不上。
  router.post("/api/compare", (ctx: Context) => {
    const tHandlerStart = Date.now();
    logger.info(
      "api.compare",
      "调用函数开始：handlePostCompare",
      "为什么写这条日志：route 只认这一层返回的对照结构；里面那两次 encodeText 是「Token 化」真正干活的部分（看「调用函数开始：encodeText」）。当前：POST /api/compare 收到请求，样本来自 presets（不在请求体里）。",
      {
        入参: {
          englishLen: ENGLISH.length,
          chineseLen: CHINESE.length,
        },
        __code: `const english = encodeText(ENGLISH);\nconst chinese = encodeText(CHINESE);`,
      },
    );

    const english = encodeText(ENGLISH);
    const chinese = encodeText(CHINESE);
    // 对照核心数据：tokens 差多少 = 「中文更碎」的物理证据
    const delta = chinese.tokenCount - english.tokenCount;
    ctx.body = {
      english,
      chinese,
      takeaway: "同一句人话，中文往往切得更碎 → 同样内容输入更贵。计费按 Token，不按字、不按词。",
    };

    logger.info(
      "api.compare",
      "调用函数结束：handlePostCompare",
      "为什么写这条日志：route 要把对照结果（en/zh/takeaway）写进 ctx.body 交给页面。当前：两次 encodeText 都已返回，delta 已算。",
      {
        返回值: {
          en_tokens: english.tokenCount,
          zh_tokens: chinese.tokenCount,
          delta,
          takeaway: "同一句人话，中文往往切得更碎 → 同样内容输入更贵。计费按 Token，不按字、不按词。",
        },
        耗时ms: Date.now() - tHandlerStart,
        字段释义: {
          delta: "中英 Token 数差值；非负就是「中文更碎」的物理证据",
        },
      },
    );
  });
}