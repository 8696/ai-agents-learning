/**
 * 模块 03 第 02 条 Demo：同一模拟需求下 Zero-shot vs Few-shot 对照
 *
 * 数据流：
 *   浏览器 POST /api/classify { text, modes }
 *     → koa 校验 → 协议 A chat.completions.create（每种 mode 一次）
 *     → 服务端先剥思考块，再用 Zod 判 JSON 壳
 *     → JSON 回给 #output 并排展示
 *
 * 为什么对照要服务端判合法：本条要讲清的是「你的任务上哪种更稳」，
 * 稳 = 下游 parse 能否吃进去 + 灰区是否按产品定义，不是「读着像人话」。
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

// ── 端口：模块 03 第 02 条 → 50302 ──
const PORT = z.coerce.number().default(50302).parse(process.env.PORT);

// ── 模拟产品：豆谷咖啡电商评价分类（自创词表 + 固定 JSON 壳 + 一条灰区产品定义）──
const SYSTEM_PROMPT = [
  "你是「豆谷」电商的评价分类器。",
  "只把用户评价分成三个中文标签：好评、中评、差评。",
  "只输出一个 JSON 对象，不要 markdown，不要解释，不要其它字段。",
  '形状必须是：{"label":"好评|中评|差评","reason":"不超过30字的中文原因"}',
  "产品定义：物流包装有瑕疵但商品本身可用 → 中评，不要判差评。",
].join("\n");

/** Few-shot 教案：覆盖三个出口 + 灰区。假数据，不含真实订单。 */
const FEW_SHOT_TURNS: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "user", content: "豆子很香，会回购。" },
  {
    role: "assistant",
    content: '{"label":"好评","reason":"明确夸品质并表示复购"}',
  },
  { role: "user", content: "还行吧，没什么特别的。" },
  {
    role: "assistant",
    content: '{"label":"中评","reason":"无褒无贬"}',
  },
  { role: "user", content: "洒了一地，客服已读不回。" },
  {
    role: "assistant",
    content: '{"label":"差评","reason":"货损且服务差"}',
  },
  { role: "user", content: "盒子压扁了，豆子真空袋是好的。" },
  {
    role: "assistant",
    content: '{"label":"中评","reason":"包装差但商品可用"}',
  },
];

const LabelSchema = z.enum(["好评", "中评", "差评"]);
const VerdictSchema = z
  .object({
    label: LabelSchema,
    reason: z.string().min(1),
  })
  .strict();

const BodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
  modes: z
    .array(z.enum(["zero", "few"]))
    .min(1)
    .max(2),
});

type ShotMode = "zero" | "few";

type ClassifyOk = {
  mode: ShotMode;
  ok: true;
  raw: string;
  /** 去掉思考块之后、交给 Zod 的那段 */
  stripped: string;
  /** 原文是否含思考块（协议 A 上 MiniMax-M3 常见） */
  hadThinking: boolean;
  /** 剥离思考块之后能否被 Zod 吃进去（网关口径，不是「模型嘴边已是纯 JSON」） */
  formatValid: boolean;
  parsed: z.infer<typeof VerdictSchema> | null;
  formatError: string | null;
};

type ClassifyFail = {
  mode: ShotMode;
  ok: false;
  error: string;
  status: number;
};

function buildMessages(
  mode: ShotMode,
  text: string,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const current: OpenAI.Chat.ChatCompletionMessageParam = {
    role: "user",
    content: text,
  };
  if (mode === "zero") {
    return [{ role: "system", content: SYSTEM_PROMPT }, current];
  }
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...FEW_SHOT_TURNS,
    current,
  ];
}

/**
 * 思考块是模型行为，不是 JSON 的一部分。
 * 网关先剥再 parse；不剥的话 JSON.parse 会撞上 '<think>' 的 '<'。
 * 未闭合的 think 则从第一个 { 起截（后面才是业务 JSON）。
 */
function stripThinking(raw: string): { body: string; hadThinking: boolean } {
  const paired = /<think\b[^>]*>[\s\S]*?<\/think>/gi;
  const withoutPairs = raw.replace(paired, "");
  const hadPaired = withoutPairs !== raw;
  let body = withoutPairs;
  const leftoverOpen = /<think\b[^>]*>/i.exec(body);
  if (leftoverOpen) {
    const brace = body.indexOf("{", leftoverOpen.index);
    body =
      brace >= 0
        ? body.slice(brace)
        : body.replace(/<think\b[^>]*>[\s\S]*/gi, "");
  }
  return {
    body: body.trim(),
    hadThinking: hadPaired || /<think\b/i.test(raw),
  };
}

function judgeFormat(raw: string): {
  stripped: string;
  hadThinking: boolean;
  formatValid: boolean;
  parsed: z.infer<typeof VerdictSchema> | null;
  formatError: string | null;
} {
  const { body, hadThinking } = stripThinking(raw);
  try {
    const parsed = VerdictSchema.parse(JSON.parse(body));
    return {
      stripped: body,
      hadThinking,
      formatValid: true,
      parsed,
      formatError: null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      stripped: body,
      hadThinking,
      formatValid: false,
      parsed: null,
      formatError: message,
    };
  }
}

function httpErrorMessage(error: unknown): { status: number; message: string } {
  if (error instanceof OpenAI.APIError) {
    return {
      status: error.status ?? 502,
      message: error.message,
    };
  }
  if (error instanceof Error) {
    return { status: 502, message: error.message };
  }
  return { status: 502, message: String(error) };
}

async function classifyOne(
  mode: ShotMode,
  text: string,
): Promise<ClassifyOk | ClassifyFail> {
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
      max_tokens: 200,
      messages: buildMessages(mode, text),
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const judged = judgeFormat(raw);
    return { mode, ok: true, raw, ...judged };
  } catch (error: unknown) {
    const mapped = httpErrorMessage(error);
    return {
      mode,
      ok: false,
      status: mapped.status,
      error: mapped.message,
    };
  }
}

const app = new Koa();
const router = new Router();

app.use(bodyParser());

router.get("/health", (ctx: Context, _next: Next) => {
  ctx.body = { ok: true, port: PORT, provider: llm.provider, model: llm.modelA };
});

router.post("/api/classify", async (ctx: Context, _next: Next) => {
  const parsedBody = BodySchema.safeParse(ctx.request.body);
  if (!parsedBody.success) {
    ctx.status = 400;
    ctx.body = {
      error: "参数错误",
      details: parsedBody.error.flatten(),
      hint: "text 不能为空；modes 至少含 zero 或 few",
    };
    return;
  }

  const uniqueModes = [...new Set(parsedBody.data.modes)];
  const results = await Promise.all(
    uniqueModes.map((mode) => classifyOne(mode, parsedBody.data.text)),
  );

  const upstreamFail = results.find(
    (row): row is ClassifyFail => row.ok === false,
  );
  if (upstreamFail && results.every((row) => row.ok === false)) {
    ctx.status = upstreamFail.status;
    ctx.body = { error: upstreamFail.error, results };
    return;
  }

  ctx.body = {
    product: "豆谷评价分类",
    system: SYSTEM_PROMPT,
    input: parsedBody.data.text,
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
