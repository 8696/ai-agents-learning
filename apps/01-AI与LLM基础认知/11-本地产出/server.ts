/**
 * 模块 01 · 本地产出 · 豆谷上新台
 *
 * 职责：运营贴一段原料，一次生成一张上新卡。Token / 窗口 / 相近现货 /
 *       低温货名 / 高温卖点都在这一次处理里。不 import 按条 Demo。
 *
 * 数据流：
 *   POST /api/listing { brief }
 *     → tokenizer 数原料 Token，超教学窗口则截断
 *     → 玩具 2 维向量排出相近现货
 *     → 协议 A：T=0 出中英货名，T=1.2 出一句卖点
 *
 * 入口：yarn app:01-11-cognition-lab → http://127.0.0.1:50111/
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import type { Context, Next } from "koa";
import { encode } from "gpt-tokenizer";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getLlmOptional, logLlmConfig } from "../../llm.js";

const llm = getLlmOptional();
const PORT = z.coerce.number().int().positive().default(50111).parse(process.env.PORT);

/** 教学用小窗口，不是厂商 200K。超了就截断，让人看见 Context 是硬上限。 */
const CONTEXT_BUDGET = 80;

type Vec = readonly [number, number];

function cosine(a: Vec, b: Vec): number {
  const dot = a[0] * b[0] + a[1] * b[1];
  const na = Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  const nb = Math.sqrt(b[0] * b[0] + b[1] * b[1]);
  if (na === 0 || nb === 0) {
    throw new Error("零向量没有方向，算不了余弦");
  }
  return dot / (na * nb);
}

const tokenId = { 猫: 5001, 狗: 3729, 石头: 880, 宠物: 2104 } as const;
const embedding: Record<keyof typeof tokenId, Vec> = {
  猫: [0.95, 0.12],
  狗: [0.82, 0.35],
  石头: [0.12, 0.94],
  宠物: [0.9, 0.2],
};

const catalog: ReadonlyArray<{ sku: string; key: keyof typeof tokenId }> = [
  { sku: "猫薄荷挂耳 10 杯", key: "猫" },
  { sku: "狗友好试喝装", key: "狗" },
  { sku: "火山岩杯垫", key: "石头" },
];

function clipToBudget(text: string, budget: number): { text: string; tokens: number; truncated: boolean } {
  const fullTokens = encode(text).length;
  if (fullTokens <= budget) {
    return { text, tokens: fullTokens, truncated: false };
  }
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (encode(text.slice(0, mid)).length <= budget) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const clipped = text.slice(0, lo);
  return { text: clipped, tokens: encode(clipped).length, truncated: true };
}

function queryKey(brief: string): keyof typeof tokenId {
  if (brief.includes("猫")) return "猫";
  if (brief.includes("狗")) return "狗";
  if (brief.includes("石") || brief.includes("岩")) return "石头";
  return "宠物";
}

const listingBody = z.object({
  brief: z.string({ required_error: "原料不能为空" }).min(1, "原料不能为空").max(4000),
});

const app = new Koa();
const router = new Router();

app.use(bodyParser());

router.get("/health", (ctx: Context) => {
  ctx.body = { ok: true, model: llm?.modelA ?? null, port: PORT, product: "dou-gu-listing" };
});

router.post("/api/listing", async (ctx: Context, _next: Next) => {
  const parsed = listingBody.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: parsed.error.issues[0]?.message ?? "原料不合法" };
    return;
  }
  const original = parsed.data.brief;
  const windowed = clipToBudget(original, CONTEXT_BUDGET);
  const q = queryKey(windowed.text);
  const similar = catalog
    .map((item) => ({
      sku: item.sku,
      score: cosine(embedding[q], embedding[item.key]),
    }))
    .sort((a, b) => b.score - a.score);

  if (!llm) {
    ctx.status = 503;
    ctx.body = { error: "未配置当前提供商的 API Key，无法生成上新卡" };
    return;
  }

  const system =
    "你是豆谷上新编辑。只根据原料写货名和卖点。" +
    "不要编造库存、精确价格、到货日期或实时天气；做不到就写「需人工核」。" +
    "这是一次推理调用，不是训练，也不是查数据库。";

  try {
    const [names, slogan] = await Promise.all([
      llm.openai.chat.completions.create({
        model: llm.modelA,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content:
              `原料：\n${windowed.text}\n\n只输出两行：\n中文货名：\nEnglish:`,
          },
        ],
        temperature: 0,
        top_p: 1,
        max_tokens: 80,
        stream: false,
      }),
      llm.openai.chat.completions.create({
        model: llm.modelA,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `原料：\n${windowed.text}\n\n只输出一句创意卖点，不要货名。`,
          },
        ],
        temperature: 1.2,
        top_p: 1,
        max_tokens: 80,
        stream: false,
      }),
    ]);

    const nameText = names.choices[0]?.message.content?.trim() ?? "";
    const sloganText = slogan.choices[0]?.message.content?.trim() ?? "";
    const zhLine = nameText.split("\n").find((l) => l.includes("中文")) ?? nameText.split("\n")[0] ?? "";
    const enLine = nameText.split("\n").find((l) => /english/i.test(l)) ?? nameText.split("\n")[1] ?? "";
    const titleZh = zhLine.replace(/^中文货名[:：]\s*/, "").trim() || zhLine.trim();
    const titleEn = enLine.replace(/^English[:：]\s*/i, "").trim() || enLine.trim();

    ctx.body = {
      titleZh,
      titleEn,
      slogan: sloganText,
      tokens: {
        vocab: "cl100k（量级对照，不是当前厂商词表）",
        briefOriginal: encode(original).length,
        briefUsed: windowed.tokens,
        titleZh: encode(titleZh).length,
        titleEn: encode(titleEn).length,
      },
      window: {
        budget: CONTEXT_BUDGET,
        truncated: windowed.truncated,
        usedBrief: windowed.text,
      },
      similar,
      query: q,
      notice: "货名和卖点是模型接出来的，不是查库。库存、价格、天气需人工核。本任务走主力档推理，没有在本地训练。",
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.status = 502;
    ctx.body = { error: `生成失败: ${message}` };
  }
});

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logLlmConfig(llm);
  console.log(`http://127.0.0.1:${PORT}/`);
});
