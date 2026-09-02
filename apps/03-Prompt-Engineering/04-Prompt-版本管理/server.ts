/**
 * 模块 03 第 04 条 Demo：一字之差，看出大影响
 *
 * 数据流：
 *   浏览器 POST /api/compare { text, modes }
 *     → koa 校验 → 协议 A chat.completions.create（每种 mode 一次）
 *     → 服务端算字符长度 / 是否含推理标记 / 首段 preview
 *     → 对比指标 + 两版原文一起回给 #output 并排展示
 *
 * 为什么这个 Demo 重要：
 *   本条「要能讲清」是「改 Prompt 和改代码一样要可追溯」。
 *   真回归集必须跑出来才知道行为差在哪。一字之差的两个版本（v1.0.0 vs v1.1.0）
 *   是「Prompt 版本管理」最直观的最小可观测单元——文本 diff 看不出来，行为 diff 一跑就见。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import { fileURLToPath } from "node:url";
import Koa from "koa";
import type { Context, Next } from "koa";
import serve from "koa-static";
import OpenAI from "openai";
import { z } from "zod";
import { getLlm, logLlmConfig } from "../../llm.js";

const llm = getLlm();
const openai = llm.openai;

// ── 端口：模块 03 第 04 条 → 50304 ──
const PORT = z.coerce.number().default(50304).parse(process.env.PORT);

/** System 提示词——两版共用，没改。这是为了让变量只剩「一字之差」。 */
const SYSTEM_PROMPT = "你是答题助理。请只回答用户的问题，不要跑题。";

/**
 * 版本名是展示用；具体 User 末尾怎么写由请求体 prompts.{v1|v2} 决定。
 * 这样 demo 不限制"Prompt 只能这么写"——用户随便改两栏即可对照。
 */
const VERSION_NAMES = {
  v1: "v1.0.0",
  v2: "v1.1.0",
} as const;

type Mode = "v1" | "v2";

const BodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
  modes: z.array(z.enum(["v1", "v2"])).min(1).max(2),
  prompts: z.object({
    v1: z.string().min(1).max(2000),
    v2: z.string().min(1).max(2000),
  }),
});

type CompareOk = {
  mode: Mode;
  ok: true;
  raw: string;
  textLen: number;
  hasReasoning: boolean;
  preview: string;
};

type CompareFail = {
  mode: Mode;
  ok: false;
  status: number;
  error: string;
};

/** 模型嘴边出现这些标记 = "它在推理"。只做粗匹配，不试图做准确语义识别。 */
const REASONING_MARKERS: RegExp[] = [
  /第一步/,
  /首先/,
  /其次/,
  /让我们/,
  /let's think/i,
  /step by step/i,
  /<think\b/i,
];

function detectReasoning(raw: string): boolean {
  return REASONING_MARKERS.some((re) => re.test(raw));
}

function previewLine(raw: string): string {
  const firstParagraph = raw.split(/\n\s*\n/)[0] ?? raw;
  const trimmed = firstParagraph.trim();
  return trimmed.length > 120 ? trimmed.slice(0, 120) + "…" : trimmed;
}

function httpErrorMessage(error: unknown): { status: number; message: string } {
  if (error instanceof OpenAI.APIError) {
    return { status: error.status ?? 502, message: error.message };
  }
  if (error instanceof Error) {
    return { status: 502, message: error.message };
  }
  return { status: 502, message: String(error) };
}

async function runOne(
  mode: Mode,
  text: string,
  promptSuffix: string,
): Promise<CompareOk | CompareFail> {
  if (!llm.apiKey) {
    return {
      mode,
      ok: false,
      status: 503,
      error: "当前 LLM_PROVIDER 缺少 API Key（写在 apps/.env，不要写进 git）",
    };
  }
  try {
    const completion = await openai.chat.completions.create({
      model: llm.modelA,
      temperature: 0,
      max_tokens: 500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${promptSuffix}\n\n问题：${text}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    return {
      mode,
      ok: true,
      raw,
      textLen: raw.length,
      hasReasoning: detectReasoning(raw),
      preview: previewLine(raw),
    };
  } catch (error: unknown) {
    const mapped = httpErrorMessage(error);
    return { mode, ok: false, status: mapped.status, error: mapped.message };
  }
}

const app = new Koa();
const router = new Router();

app.use(bodyParser());

router.get("/health", (ctx: Context, _next: Next) => {
  ctx.body = { ok: true, port: PORT, provider: llm.provider, model: llm.modelA };
});

router.post("/api/compare", async (ctx: Context, _next: Next) => {
  const parsedBody = BodySchema.safeParse(ctx.request.body);
  if (!parsedBody.success) {
    ctx.status = 400;
    ctx.body = {
      error: "参数错误",
      details: parsedBody.error.flatten(),
      hint: "text 不能为空；modes 至少含 v1 或 v2",
    };
    return;
  }

  const uniqueModes = [...new Set(parsedBody.data.modes)];
  const results = await Promise.all(
    uniqueModes.map((mode) =>
      runOne(mode, parsedBody.data.text, parsedBody.data.prompts[mode]),
    ),
  );

  const upstreamFail = results.find(
    (row): row is CompareFail => row.ok === false,
  );
  if (upstreamFail && results.every((row) => row.ok === false)) {
    ctx.status = upstreamFail.status;
    ctx.body = { error: upstreamFail.error, results };
    return;
  }

  ctx.body = {
    input: parsedBody.data.text,
    versions: {
      v1: {
        name: VERSION_NAMES.v1,
        suffix: parsedBody.data.prompts.v1,
      },
      v2: {
        name: VERSION_NAMES.v2,
        suffix: parsedBody.data.prompts.v2,
      },
    },
    results,
  };
});

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${PORT}/`);
  logLlmConfig(llm);
});
