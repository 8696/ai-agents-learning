/**
 * 职责：两个 encode 端点 —— 自定义一段 / 固定中英对照。
 * 数据流：闸门 → encodeText → ctx.body。全程本地，不调 LLM。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readEncodeBody } from "../lib/http/request-guards.js";
import { encodeText } from "../lib/tokenize/encode-text.js";
import { CHINESE, ENGLISH } from "../lib/tokenize/presets.js";

export function mountEncodeRoutes(router: Router): void {
  router.post("/api/encode", (ctx: Context) => {
    const body = readEncodeBody(ctx);
    if (!body) return;
    ctx.body = encodeText(body.text);
  });

  // 对照端点不收 body：样本来自 presets，避免页面自己写死两句对不上。
  router.post("/api/compare", (ctx: Context) => {
    ctx.body = {
      english: encodeText(ENGLISH),
      chinese: encodeText(CHINESE),
      takeaway: "同一句人话，中文往往切得更碎 → 同样内容输入更贵。计费按 Token，不按字、不按词。",
    };
  });
}
