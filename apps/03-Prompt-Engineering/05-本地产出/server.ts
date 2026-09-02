/**
 * 模块 03 · 本地产出 · 豆谷客服中台（完整产品，不是按条 Demo 拼盘）
 *
 * 职责：客服打开就能处理来信 / 纪要 / 内部问答。
 *       抽取、分类、路由、情感、改写、摘要、版本、转义、Few-shot 都在这条业务路径里跑，
 *       不在首页摆「对照 Zero」「故意 429」按钮。不 import 01～04。
 *
 * 数据流：
 *   POST /api/inbox    一封来信 → 并行：路由 / 抽订单 / Few-shot 分类 / 情感 / 书面转述 / 摘要
 *   POST /api/minutes  纪要 → action items
 *   POST /api/faq      问题 → 只根据内置制度段落作答
 *
 * 入口：yarn app:03-05-prompt-lab → http://127.0.0.1:50305/
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import { fileURLToPath } from "node:url";
import Koa from "koa";
import type { Context, Next } from "koa";
import serve from "koa-static";
import type OpenAI from "openai";
import { z } from "zod";
import { getLlm, logLlmConfig } from "../../llm.js";
import {
  PROMPTS,
  renderPrompt,
  type PromptTemplate,
} from "./src/prompts.js";

const llm = getLlm();
const PORT = z.coerce.number().int().positive().default(50305).parse(process.env.PORT);

const FAQ_CONTEXT = [
  "【1】员工入职当天需提交身份证复印件、银行卡号、紧急联系人。",
  "【2】试用期 3 个月，期间不享受年终奖。",
  "【3】病假超过 3 天需提交医院证明。",
  "【4】年假：满 1 年 5 天，满 5 年 10 天。",
  "【5】发票需在订单完成后 30 天内申请。",
  "【6】退货运费由买家承担除非另有约定。",
].join("\n");

const FEW_SHOT_TURNS: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "user", content: "评论：豆子很香，会回购。\n输出：" },
  { role: "assistant", content: '{"label":"好评","reason":"明确夸品质并表示复购"}' },
  { role: "user", content: "评论：还行吧，没什么特别的。\n输出：" },
  { role: "assistant", content: '{"label":"中评","reason":"无褒无贬"}' },
  { role: "user", content: "评论：洒了一地，客服已读不回。\n输出：" },
  { role: "assistant", content: '{"label":"差评","reason":"货损且服务差"}' },
  { role: "user", content: "评论：盒子压扁了，但咖啡豆真空袋是好的。\n输出：" },
  { role: "assistant", content: '{"label":"中评","reason":"包装差但商品可用"}' },
];

function visibleText(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function mustPrompt(id: string): PromptTemplate {
  const found = PROMPTS.find((p) => p.id === id);
  if (!found) {
    throw new Error(`缺少 Prompt ${id}`);
  }
  return found;
}

function meta(p: PromptTemplate): { id: string; name: string; version: string } {
  return { id: p.id, name: p.name, version: p.version };
}

async function complete(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): Promise<string> {
  const completion = await llm.openai.chat.completions.create({
    model: llm.modelA,
    temperature: 0,
    max_tokens: 220,
    messages,
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  return visibleText(raw) || raw.trim();
}

async function runNamed(
  id: string,
  vars: Record<string, string>,
  extra?: OpenAI.Chat.ChatCompletionMessageParam[],
): Promise<{ text: string; used: ReturnType<typeof meta> }> {
  const p = mustPrompt(id);
  const userContent = renderPrompt(p.userTemplate, vars);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: p.system },
    ...(extra ?? []),
    { role: "user", content: userContent },
  ];
  const text = await complete(messages);
  return { text, used: meta(p) };
}

const app = new Koa();
const router = new Router();
app.use(bodyParser());

router.get("/health", (ctx: Context) => {
  ctx.body = { ok: true, model: llm.modelA, port: PORT, product: "dou-gu-desk" };
});

const inboxBody = z.object({
  message: z.string().min(1, "来信不能为空").max(4000),
});

router.post("/api/inbox", async (ctx: Context, _next: Next) => {
  const parsed = inboxBody.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: parsed.error.issues[0]?.message ?? "来信不合法" };
    return;
  }
  const message = parsed.data.message;
  const classify = mustPrompt("classify-review");
  const classifyUser = renderPrompt(classify.userTemplate, { review: message });
  try {
    const [route, order, review, sentiment, restated, summary] = await Promise.all([
      runNamed("route-intent", { message }),
      runNamed("extract-order-info", { mail: message }),
      complete([
        { role: "system", content: classify.system },
        ...FEW_SHOT_TURNS,
        { role: "user", content: classifyUser },
      ]).then((text) => ({ text, used: meta(classify) })),
      runNamed("analyze-sentiment", { comment: message }),
      runNamed("rewrite-formal", { sentence: message }),
      runNamed("summarize-news", { article: message }),
    ]);
    ctx.body = {
      message,
      route: route.text,
      order: order.text,
      review: review.text,
      sentiment: sentiment.text,
      restated: restated.text,
      summary: summary.text,
      used: [
        route.used,
        order.used,
        review.used,
        sentiment.used,
        restated.used,
        summary.used,
      ],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    ctx.status = 502;
    ctx.body = { error: `处理失败: ${msg}` };
  }
});

const minutesBody = z.object({
  minutes: z.string().min(1, "纪要不能为空").max(4000),
});

router.post("/api/minutes", async (ctx: Context, _next: Next) => {
  const parsed = minutesBody.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: parsed.error.issues[0]?.message ?? "纪要不合法" };
    return;
  }
  try {
    const actions = await runNamed("extract-meeting-actions", {
      minutes: parsed.data.minutes,
    });
    ctx.body = { actions: actions.text, used: [actions.used] };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    ctx.status = 502;
    ctx.body = { error: `处理失败: ${msg}` };
  }
});

const faqBody = z.object({
  question: z.string().min(1, "问题不能为空").max(500),
});

router.post("/api/faq", async (ctx: Context, _next: Next) => {
  const parsed = faqBody.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: parsed.error.issues[0]?.message ?? "问题不合法" };
    return;
  }
  try {
    const qa = await runNamed("qa-faq-with-context", {
      context: FAQ_CONTEXT,
      question: parsed.data.question,
    });
    ctx.body = { answer: qa.text, used: [qa.used] };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    ctx.status = 502;
    ctx.body = { error: `处理失败: ${msg}` };
  }
});

app.use(router.routes()).use(router.allowedMethods());
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logLlmConfig(llm);
  console.log(`http://127.0.0.1:${PORT}/`);
});
