/**
 * Demo · Adapter 层 HTTP server（koa + §5.3 HTML 内联 React）
 *
 * 业务代码完全不碰 SDK——只调 sendMessage(opts)，由 adapter 决定走哪个协议。
 *
 * 端点：
 *   GET  /               静态 HTML（§5.3 骨架 + 一次性 / 流式两面板）
 *   GET  /health         adapter 状态
 *   POST /api/chat       一次调 adapter.sendMessage，返回统一格式
 *   POST /api/chat-stream 调 adapter.sendMessageStream，SSE 推 UnifiedDelta
 *
 * 入口：yarn app:02-03-adapter → tsx server.ts（无 index.ts）
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import type { Context, Next } from "koa";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  sendMessage,
  sendMessageStream,
  type Protocol,
} from "./adapter.js";
import { getLlm, logLlmConfig } from "../../llm.js";

const PORT = Number(process.env.PORT) || 50213;

const bodySchema = z.object({
  message: z.string().min(1, "message 不能为空"),
  protocol: z.enum(["A", "B"]),
  system: z.string().optional(),
  thinking_budget: z.number().int().positive().optional(),
});

function toOpts(body: z.infer<typeof bodySchema>) {
  return {
    protocol: body.protocol as Protocol,
    message: body.message,
    system: body.system,
    ...(body.thinking_budget !== undefined
      ? {
          thinking: {
            type: "enabled" as const,
            budget_tokens: body.thinking_budget,
          },
        }
      : {}),
  };
}

const app = new Koa();
const router = new Router();

app.use(bodyParser());

router.get("/health", (ctx: Context) => {
  ctx.body = { ok: true, endpoints: ["POST /api/chat", "POST /api/chat-stream"] };
});

router.post("/api/chat", async (ctx: Context, _next: Next) => {
  const parsed = bodySchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: `请求体不合法: ${parsed.error.message}` };
    return;
  }
  try {
    const unified = await sendMessage(toOpts(parsed.data));
    ctx.body = unified;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.status = 500;
    ctx.body = { error: msg };
  }
});

router.post("/api/chat-stream", async (ctx: Context, _next: Next) => {
  ctx.respond = false;
  const parsed = bodySchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.res.writeHead(400, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ error: `请求体不合法: ${parsed.error.message}` }));
    return;
  }

  ctx.res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    for await (const delta of sendMessageStream(toOpts(parsed.data))) {
      ctx.res.write(`data: ${JSON.stringify(delta)}\n\n`);
    }
    ctx.res.write("data: [DONE]\n\n");
    ctx.res.end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.res.write(`data: ${JSON.stringify({ type: "_error", error: msg })}\n\n`);
    ctx.res.end();
  }
});

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    "──── 模块 02 · Adapter Demo（§5.3 React + koa · HTML 内联块）· 已启动 ────",
  );
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  POST /api/chat         → UnifiedResponse JSON`);
  console.log(`  POST /api/chat-stream  → SSE UnifiedDelta`);
  console.log(`  业务代码只调 sendMessage / sendMessageStream，不碰 SDK`);
  logLlmConfig(getLlm());
  console.log(`  Ctrl+C 退出`);
});
