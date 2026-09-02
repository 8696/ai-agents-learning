/**
 * 模块 02 · 本地产出 · 豆谷值班台
 *
 * 职责：客服贴客户问句，先流式出草稿（协议 A），再一次性终审（协议 B）。
 *       取消、用量、429 退避都在这条路径里。不 import 按条 Demo。
 *
 * 数据流：
 *   POST /api/draft  { question } → SSE（协议 A）；客户端可 abort
 *   POST /api/review { question, draft } → JSON（协议 B，非流式终审）
 *
 * 入口：yarn app:02-06-api-lab → http://127.0.0.1:50206/
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import type { Context, Next } from "koa";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getLlm, logLlmConfig } from "../../llm.js";

const llm = getLlm();
const PORT = z.coerce.number().int().positive().default(50206).parse(process.env.PORT);
const PRICE_PER_1K = 0.001;

const draftBody = z.object({
  question: z.string({ required_error: "客户问句不能为空" }).min(1, "客户问句不能为空").max(2000),
});

const reviewBody = z.object({
  question: z.string().min(1).max(2000),
  draft: z.string().min(1, "没有草稿可终审").max(8000),
});

function usageCost(prompt: number, completion: number) {
  const total = prompt + completion;
  const yuan = (total / 1000) * PRICE_PER_1K;
  return { prompt, completion, total, yuan, pricePer1k: PRICE_PER_1K };
}

function httpStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

async function withBackoff<T>(run: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await run();
    } catch (error: unknown) {
      last = error;
      const status = httpStatus(error);
      const retryable = status === 429 || status === 408 || (status !== undefined && status >= 500);
      if (!retryable || attempt === 2) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
    }
  }
  throw last;
}

const DESK_SYSTEM =
  "你是豆谷值班客服。根据客户问句写答复草稿。不要编库存和物流轨迹。" +
  "做不到就说需要同事核实。只写给客户看的正文。";

const app = new Koa();
const router = new Router();

app.use(bodyParser());

router.get("/health", (ctx: Context) => {
  ctx.body = {
    ok: true,
    modelA: llm.modelA,
    modelB: llm.modelB,
    port: PORT,
    product: "dou-gu-desk-shift",
  };
});

router.post("/api/draft", async (ctx: Context, _next: Next) => {
  const parsed = draftBody.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: parsed.error.issues[0]?.message ?? "问句不合法" };
    return;
  }
  const question = parsed.data.question;

  ctx.respond = false;
  ctx.res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let aborted = false;
  ctx.req.on("close", () => {
    aborted = true;
  });

  try {
    const streamA = await withBackoff(() =>
      llm.openai.chat.completions.create({
        model: llm.modelA,
        messages: [
          { role: "system", content: DESK_SYSTEM },
          { role: "user", content: question },
        ],
        stream: true,
        stream_options: { include_usage: true },
      }),
    );
    let prompt = 0;
    let completion = 0;
    for await (const chunk of streamA) {
      if (aborted) break;
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (chunk.usage) {
        prompt = chunk.usage.prompt_tokens ?? prompt;
        completion = chunk.usage.completion_tokens ?? completion;
      }
      if (delta) {
        ctx.res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }
    ctx.res.write(`data: ${JSON.stringify({ done: true, usage: usageCost(prompt, completion) })}\n\n`);
    ctx.res.end();
  } catch (error: unknown) {
    const messageText = error instanceof Error ? error.message : String(error);
    const status = httpStatus(error);
    const hint = status === 429 ? "系统繁忙，已退避仍失败，请稍后再试" : messageText;
    try {
      ctx.res.write(`data: ${JSON.stringify({ error: hint })}\n\n`);
      ctx.res.end();
    } catch {
      /* already closed */
    }
  }
});

router.post("/api/review", async (ctx: Context, _next: Next) => {
  const parsed = reviewBody.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: parsed.error.issues[0]?.message ?? "终审参数不合法" };
    return;
  }
  const { question, draft } = parsed.data;
  try {
    const msg = await withBackoff(() =>
      llm.anthropic.messages.create({
        model: llm.modelB,
        max_tokens: llm.maxTokensB,
        system: "你是豆谷值班终审。把草稿改成更稳妥的对外回复。只输出终稿正文。",
        messages: [
          {
            role: "user",
            content: `客户问：${question}\n\n草稿：\n${draft}`,
          },
        ],
      }),
    );
    const text = msg.content[0] && msg.content[0].type === "text" ? msg.content[0].text : "";
    ctx.body = {
      protocol: "b",
      text,
      usage: usageCost(msg.usage.input_tokens, msg.usage.output_tokens),
    };
  } catch (error: unknown) {
    const messageText = error instanceof Error ? error.message : String(error);
    const status = httpStatus(error);
    ctx.status = status === 429 ? 429 : 502;
    ctx.body = {
      error: status === 429 ? "系统繁忙，已退避仍失败，请稍后再试" : `终审失败: ${messageText}`,
    };
  }
});

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logLlmConfig(llm);
  console.log(`http://127.0.0.1:${PORT}/`);
});
