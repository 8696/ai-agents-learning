/**
 * 职责：GET / POST /api/real —— 真实模型流式，原样转发 OpenAI chunk。
 *
 * 数据流：
 *   GET  → 用默认 prompt（旧单页 Demo 同一句）
 *   POST → body.prompt；空字符串 400
 *   没 Key → 503（必须在开流之前）
 *   开流 → streamRealToSse → data: chunk… → data: [DONE]
 *
 * 为什么单独成文件：这是本 Demo 唯一会花额度的端点；闸门顺序错了，400/503 会变成一条「成功但空」的流。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm } from "../lib/http/runtime-ctx.js";
import { parseRealPrompt, writeRawJson } from "../lib/http/request-guards.js";
import { DEFAULT_REAL_PROMPT, streamRealToSse } from "../lib/flow/stream-real.js";
import { openSseStream } from "../lib/sse/sse-writer.js";

async function handleReal(ctx: Context): Promise<void> {
  // ① 接管响应：后面无论 400 / 503 / SSE，都不能再用 ctx.body
  ctx.respond = false;

  let prompt = DEFAULT_REAL_PROMPT;
  if (ctx.method === "POST") {
    const parsed = parseRealPrompt(ctx.request.body);
    if (!parsed.ok) {
      writeRawJson(ctx.res, 400, { error: `请求体不合法：${parsed.reason}` });
      return;
    }
    prompt = parsed.prompt;
  }

  // ② 没 Key 在开流前挡掉。页面其实早就从 /health 锁了主按钮，这里是服务端兜底
  if (!llm) {
    writeRawJson(ctx.res, 503, {
      error: "当前 LLM_PROVIDER 没有可用 Key：先在 apps/.env 配置后重启服务",
    });
    return;
  }

  const writer = openSseStream(ctx.res);
  const stats = await streamRealToSse({ llm, prompt, writer });
  if (stats.failed) {
    console.log(`  ${ctx.method} /api/real  上游失败=${stats.failed.message}`);
  }
}

export function mountRealRoutes(router: Router): void {
  router.get("/api/real", handleReal);
  router.post("/api/real", handleReal);
}
