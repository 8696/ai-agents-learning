/**
 * 职责：两个 encode 端点 —— 自定义一段 / 固定中英对照。
 * 数据流：闸门 → encodeText → ctx.body。全程本地，不调 LLM。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readEncodeBody } from "../lib/http/request-guards.js";
import { encodeText } from "../lib/tokenize/encode-text.js";
import { CHINESE, ENGLISH } from "../lib/tokenize/presets.js";
import { logger } from "../lib/logger.js";

export function mountEncodeRoutes(router: Router): void {
  router.post("/api/encode", (ctx: Context) => {
    logger.info("encode.received", "POST /api/encode", "前端自定义页发来一段文本；记 textLen 便于复现 + 防滥用", {
      textLen: (ctx.request.body as { text?: string } | undefined)?.text?.length ?? 0,
    });
    const body = readEncodeBody(ctx);
    if (!body) return; // 闸门已经写过 warn + 400
    const result = encodeText(body.text);
    logger.info("encode.reply.sent", "responded to client", "encode 完已返回前端；记 charCount/tokenCount 让回查日志能对齐页面 #output", {
      status: 200,
      charCount: result.charCount,
      tokenCount: result.tokenCount,
    });
    ctx.body = result;
  });

  // 对照端点不收 body：样本来自 presets，避免页面自己写死两句对不上。
  router.post("/api/compare", (ctx: Context) => {
    logger.info("encode.compare.received", "POST /api/compare", "中英对照页发来请求；样本来自 presets（不在请求体里）", {
      englishLen: ENGLISH.length,
      chineseLen: CHINESE.length,
    });
    const english = encodeText(ENGLISH);
    const chinese = encodeText(CHINESE);
    // 对照核心数据：tokens 差多少 = 「中文更碎」的物理证据
    const delta = chinese.tokenCount - english.tokenCount;
    logger.info("encode.compare.reply.sent", "responded to client", "对照结果已返回前端；记中英 token 差 = 这一刀的教学锚点", {
      status: 200,
      en_tokens: english.tokenCount,
      zh_tokens: chinese.tokenCount,
      delta,
    });
    ctx.body = {
      english,
      chinese,
      takeaway: "同一句人话，中文往往切得更碎 → 同样内容输入更贵。计费按 Token，不按字、不按词。",
    };
  });
}
