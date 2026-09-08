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
 *
 * 日志（§5.3.16）：调用函数 五件套（handleReal 封装层）；
 *   闸门挡掉（400 / 503）单独打 info 闸门拒绝——不算调用，不套五件套；
 *   真正出网日志全部在 lib/flow/stream-real.ts。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { llm } from "../lib/http/runtime-ctx.js";
import { parseRealPrompt, writeRawJson } from "../lib/http/request-guards.js";
import { DEFAULT_REAL_PROMPT, streamRealToSse } from "../lib/flow/stream-real.js";
import { openSseStream } from "../lib/sse/sse-writer.js";

async function handleReal(ctx: Context): Promise<void> {
  // ① 接管响应：后面无论 400 / 503 / SSE，都不能再用 ctx.body
  ctx.respond = false;
  const tHandlerStart = Date.now();

  let prompt = DEFAULT_REAL_PROMPT;
  if (ctx.method === "POST") {
    const parsed = parseRealPrompt(ctx.request.body);
    if (!parsed.ok) {
      logger.info(
        "api.real",
        `${ctx.method} /api/real 被入参闸门挡掉`,
        "为什么打：闸门挡掉没花模型额度也没走到 streamRealToSse；记下 method 便于复盘哪类失败最常见。当前：body 不合法。",
        { method: ctx.method, reason: parsed.reason },
      );
      writeRawJson(ctx.res, 400, { error: `请求体不合法：${parsed.reason}` });
      return;
    }
    prompt = parsed.prompt;
  }

  // ② 没 Key 在开流前挡掉。页面其实早就从 /health 锁了主按钮，这里是服务端兜底
  if (!llm) {
    logger.info(
      "api.real",
      `${ctx.method} /api/real 被无 Key 闸门挡掉`,
      "为什么打：服务端兜底；页面早就从 /health 看到 hasKey=false 已禁按钮，这里再挡一次防「绕过 UI 直接 curl」。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
      { method: ctx.method },
    );
    writeRawJson(ctx.res, 503, {
      error: "当前 LLM_PROVIDER 没有可用 Key：先在 apps/.env 配置后重启服务",
    });
    return;
  }

  logger.info(
    "api.real",
    "调用函数开始：handleReal",
    "为什么打：route 只认这一层返回的 stats 形状（frameCount / failed?）；里面 streamRealToSse 是「真活」（看「调用模型开始：对话补全」）。当前：闸门已通过、SSE 头已发出，即将交给 streamRealToSse。",
    {
      入参: {
        method: ctx.method,
        promptPreview: prompt.length > 60 ? `${prompt.slice(0, 60)}…` : prompt,
        promptLen: prompt.length,
        llmProvider: llm.provider,
        llmModelA: llm.modelA,
        llmBaseURL: llm.baseUrlA,
      },
      __code: `const writer = openSseStream(ctx.res);\nconst stats = await streamRealToSse({ llm, prompt, writer });`,
    },
  );

  const writer = openSseStream(ctx.res);
  const stats = await streamRealToSse({ llm, prompt, writer });

  if (stats.failed) {
    logger.warn(
      "api.real",
      "调用函数结束：handleReal",
      "为什么打：客户端已收到 SSE error 帧；HTTP 仍 200（流已开），靠帧里的 upstreamStatus / message 排错。当前：streamRealToSse 已返回失败 stats。",
      {
        返回值: {
          method: ctx.method,
          frameCount: stats.frameCount,
          message: stats.failed.message,
          upstreamStatus: stats.failed.upstreamStatus,
        },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
    console.log(`  ${ctx.method} /api/real  上游失败=${stats.failed.message}`);
  } else {
    logger.info(
      "api.real",
      "调用函数结束：handleReal",
      "为什么打：route 要把 stats 写给客户端（成功路径只打帧数）；耗时是页面 TTFT 对照的另一把尺。当前：streamRealToSse 已返回。",
      {
        返回值: { method: ctx.method, frameCount: stats.frameCount, failed: undefined },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  }
}

export function mountRealRoutes(router: Router): void {
  router.get("/api/real", handleReal);
  router.post("/api/real", handleReal);
}