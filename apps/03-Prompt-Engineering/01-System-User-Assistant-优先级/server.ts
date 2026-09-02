/**
 * 模块 03 · 01 System / User / Assistant 优先级 + 多轮 Demo（koa + §5.3 HTML 内联块）
 *
 * 职责：起一个 koa HTTP server，暴露 3 个 case 端点 + 静态页。
 *       每个端点同时调协议 A 与协议 B（同 Key、不同 baseURL），
 *       让学习者肉眼对照两边的输出 + 自动判定：
 *         - /api/case1-priority       → System JSON-only vs User 长文段 → SYSTEM_WIN / USER_WIN
 *         - /api/case2-with-history   → 多轮 WITH assistant 历史     → REMEMBERED / FORGOT
 *         - /api/case3-no-history     → 多轮 WITHOUT assistant 历史   → FORGOT / PARTIAL
 *
 * 数据流：
 *   浏览器 POST /api/case1-priority
 *     → Promise.allSettled([协议 A, 协议 B])
 *     → 各自跑一次真实 MiniMax-M3 → 拿回 text + usage
 *     → 本地判定 → JSON { a: {...}, b: {...} }
 *
 *   浏览器 POST /api/case2-with-history / /api/case3-no-history
 *     → 同上，但 messages 不同（前者 3 轮 user/assistant/user，后者 2 轮 user/user）
 *
 * 为什么：这一条「本条要能讲清」是字段层机制 + 多轮历史。必须真跑一次，
 *        才能让学习者亲眼看到：
 *          · System > User > Assistant 优先级是事实（不是厂商开关）
 *          · 协议 A 的 thinking block 会嵌进 content 字符串，破坏 strict JSON
 *          · 协议 B 顶层 system 在结构化约束上更"干净"
 *          · 不塞 assistant 历史 → 协议 B 会自信地编造（幻觉样本）
 *
 * §5.3 完整版（2026-09-02 维护模式拆分）：
 *     - 后端改造：node:http → koa + @koa/router + koa-static + @koa/bodyparser
 *     - 入口层 index.ts 删除（§5.3.3「不再单独入口层」）
 *     - 前端改造：vanilla JS → React 18.3.1（UMD CDN）+ Babel Standalone 7.26.4（HTML 内联 JSX 块）
 *     - 业务逻辑（runCase1 / runCase2 / runCase3 / judgeCase1 / judgeCase2 / judgeCase3 /
 *       runProtocolA / runProtocolB / VERDICT_LABEL / 类型）从旧 server.ts 一字不改搬过来
 *     - §5.3.4 强制 4 个 id（#page-header / #page-title / #status-pill / #page-main /
 *       #controls / #output / #page-footer）由 React 渲染
 *
 * 跑前需要：apps/.env 里填 MINIMAX_API_KEY（模块 00 已设）。
 *
 * 概念 / 取舍 / 踩坑：docs/学习模块/03-Prompt-Engineering/01-System-User-Assistant-优先级.md
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import type { Context, Next } from "koa";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getLlm, logLlmConfig } from "../../llm.js";

const llm = getLlm();
const aClient = llm.openai;
const bClient = llm.anthropic;
const PORT = z.coerce.number().int().positive().default(50301).parse(
  process.env.PORT,
);

// ── 3) 类型 ──
type Role = "system" | "user" | "assistant";
type Turn = { role: Exclude<Role, "system">; content: string };
type Verdict = "SYSTEM_WIN" | "USER_WIN" | "REMEMBERED" | "FORGOT" | "PARTIAL";
type CallResult = {
  text: string;
  usage: { input: number; output: number };
  durationMs: number;
};
type SideResult = {
  protocol: "A" | "B";
  text: string;
  cleanedText: string; // 剥掉 … 后的真实内容（演示"如何关闭思考"）
  usage: { input: number; output: number };
  durationMs: number;
  verdict: Verdict;
  verdictLabel: string;
  error?: string;
};
type CaseResponse = {
  caseName: string;
  system: string | null;
  user: string;
  turns: Turn[];
  a: SideResult;
  b: SideResult;
};

// ── 4) 判定标签映射 ──
const VERDICT_LABEL: Record<Verdict, string> = {
  SYSTEM_WIN: "✅ System 生效（输出 JSON）",
  USER_WIN: "❌ User 覆盖（没出 JSON）",
  REMEMBERED: "✅ 记得（北京出现）",
  FORGOT: "❌ 失忆 / 瞎猜 / 反问",
  PARTIAL: "⚠️  妥协（既有 JSON 又有 JSON 外的散文）",
};

// ── 5) 两个协议的调用封装 ──
async function runProtocolA(
  system: string | null,
  turns: Turn[],
): Promise<CallResult> {
  const t0 = performance.now();
  const messages: Array<{ role: Role; content: string }> = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push(...turns);

  const r = await aClient.chat.completions.create({
    model: llm.modelA,
    messages,
    stream: false,
  });
  const t1 = performance.now();
  const plain = JSON.parse(JSON.stringify(r));
  return {
    text: plain.choices?.[0]?.message?.content ?? "",
    usage: {
      input: plain.usage?.prompt_tokens ?? 0,
      output: plain.usage?.completion_tokens ?? 0,
    },
    durationMs: Math.round(t1 - t0),
  };
}

async function runProtocolB(
  system: string | null,
  turns: Turn[],
): Promise<CallResult> {
  const t0 = performance.now();
  const r = await bClient.messages.create({
    model: llm.modelB,
    system: system ?? undefined,
    max_tokens: llm.maxTokensB,
    messages: turns,
  });
  const t1 = performance.now();
  const plain = JSON.parse(JSON.stringify(r));
  const text = (plain.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text?: string }) => b.text ?? "")
    .join("");
  return {
    text,
    usage: {
      input: plain.usage?.input_tokens ?? 0,
      output: plain.usage?.output_tokens ?? 0,
    },
    durationMs: Math.round(t1 - t0),
  };
}

// ── 6) 判定函数 ──
// Case 1 的正确语义：System 要求 JSON-only 格式；User 要求长文段解释。
// 「System 生效」= 模型输出了符合 System 要求的 JSON（即使里面有 thinking 块污染）。
// 「User 覆盖」= 模型没出 JSON，而是按 User 的话写了一长段散文。
// 「妥协」= 既有 JSON 又有 JSON 之外的散文。
function judgeCase1(text: string): Verdict {
  // 1) 剥掉 thinking 块（这是模型行为，不是优先级问题）
  const withoutThink = text.replace(/[\s\S]*?<\/think>/g, "");
  // 2) 看是否能找到含 reply 字段的 JSON
  const jsonMatch = withoutThink.match(/\{[\s\S]*?"reply"[\s\S]*?\}/);
  let hasValidJson = false;
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed.reply === "string") hasValidJson = true;
    } catch {
      /* fallthrough */
    }
  }
  // 3) 剥掉 JSON 看剩下的是不是散文
  const proseOnly = withoutThink
    .replace(/\{[\s\S]*?"reply"[\s\S]*?\}/g, "")
    .trim();
  const hasProseOutside = proseOnly.length > 20;

  if (hasValidJson && !hasProseOutside) return "SYSTEM_WIN";
  if (hasValidJson && hasProseOutside) return "PARTIAL";
  if (!hasValidJson && proseOnly.length > 30) return "USER_WIN";
  return "PARTIAL";
}

// 把 … 剥掉，露出协议 A content 字符串里的"真实 JSON"。
// 这就是生产里"如何在协议 A 关掉思考模式"的工程答案：API 不给关，你自己剥。
function stripThink(text: string): string {
  return text.replace(/[\s\S]*?<\/think>/g, "").trim();
}

function judgeCase2(text: string): Verdict {
  // 提到北京 → 记得
  return text.includes("北京") ? "REMEMBERED" : "FORGOT";
}

function judgeCase3(text: string): Verdict {
  // 明确承认不知道 / 反问 → 失忆（没塞 assistant 历史，看不见对话流）
  if (
    text.includes("不知道") ||
    text.includes("没说") ||
    text.includes("您没") ||
    text.includes("请告诉") ||
    text.includes("没有提") ||
    text.includes("没提")
  ) {
    return "FORGOT";
  }
  // 提到了具体城市但又不是北京 → 瞎猜
  if (text.includes("北京")) {
    // messages 数组里能看到"我住北京"（user role），模型直接读到了第一句；
    // 出现"北京"=模型从 messages 里看到了，不是真正"多轮记得"。
    return "PARTIAL";
  }
  return "FORGOT";
}

// ── 7) 把 CallResult 包成 SideResult（带判定 + 标签）──
function toSide(
  protocol: "A" | "B",
  cr: CallResult,
  judge: (text: string) => Verdict,
): SideResult {
  const verdict = judge(cr.text);
  return {
    protocol,
    text: cr.text,
    cleanedText: stripThink(cr.text),
    usage: cr.usage,
    durationMs: cr.durationMs,
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
  };
}

// ── 8) Case 1：优先级对照 ──
async function runCase1(): Promise<CaseResponse> {
  const system =
    "你只能输出 JSON，格式 {\"reply\": string}，禁止任何解释或额外文字。";
  const user =
    "请评价「今天天气不错」这句话，并**用至少 80 字中文详细说明你的理由**。";
  const turns: Turn[] = [{ role: "user", content: user }];

  const [aRes, bRes] = await Promise.allSettled([
    runProtocolA(system, turns),
    runProtocolB(system, turns),
  ]);

  const a: SideResult =
    aRes.status === "fulfilled"
      ? toSide("A", aRes.value, judgeCase1)
      : {
          protocol: "A",
          text: "",
          cleanedText: "",
          usage: { input: 0, output: 0 },
          durationMs: 0,
          verdict: "PARTIAL",
          verdictLabel: "⚠️  请求失败",
          error: aRes.reason instanceof Error ? aRes.reason.message : String(aRes.reason),
        };
  const b: SideResult =
    bRes.status === "fulfilled"
      ? toSide("B", bRes.value, judgeCase1)
      : {
          protocol: "B",
          text: "",
          cleanedText: "",
          usage: { input: 0, output: 0 },
          durationMs: 0,
          verdict: "PARTIAL",
          verdictLabel: "⚠️  请求失败",
          error: bRes.reason instanceof Error ? bRes.reason.message : String(bRes.reason),
        };

  return { caseName: "case1-priority", system, user, turns, a, b };
}

// ── 9) Case 2：多轮 WITH assistant 历史 ──
async function runCase2(): Promise<CaseResponse> {
  const turns: Turn[] = [
    { role: "user", content: "我住北京。" },
    { role: "assistant", content: "好的，已记录。" }, // ← 必须塞回去
    { role: "user", content: "我刚才说的城市今天天气怎么样？" },
  ];

  const [aRes, bRes] = await Promise.allSettled([
    runProtocolA(null, turns),
    runProtocolB(null, turns),
  ]);

  const a: SideResult =
    aRes.status === "fulfilled"
      ? toSide("A", aRes.value, judgeCase2)
      : {
          protocol: "A",
          text: "",
          cleanedText: "",
          usage: { input: 0, output: 0 },
          durationMs: 0,
          verdict: "FORGOT",
          verdictLabel: "⚠️  请求失败",
          error: aRes.reason instanceof Error ? aRes.reason.message : String(aRes.reason),
        };
  const b: SideResult =
    bRes.status === "fulfilled"
      ? toSide("B", bRes.value, judgeCase2)
      : {
          protocol: "B",
          text: "",
          cleanedText: "",
          usage: { input: 0, output: 0 },
          durationMs: 0,
          verdict: "FORGOT",
          verdictLabel: "⚠️  请求失败",
          error: bRes.reason instanceof Error ? bRes.reason.message : String(bRes.reason),
        };

  return {
    caseName: "case2-with-history",
    system: null,
    user: "(3 轮 user/assistant/user，最后一问)",
    turns,
    a,
    b,
  };
}

// ── 10) Case 3：多轮 WITHOUT assistant 历史（失忆对照组）──
async function runCase3(): Promise<CaseResponse> {
  const turns: Turn[] = [
    { role: "user", content: "我住北京。" },
    // ← 关键：assistant 历史漏掉，不塞
    { role: "user", content: "我刚才说的城市今天天气怎么样？" },
  ];

  const [aRes, bRes] = await Promise.allSettled([
    runProtocolA(null, turns),
    runProtocolB(null, turns),
  ]);

  const a: SideResult =
    aRes.status === "fulfilled"
      ? toSide("A", aRes.value, judgeCase3)
      : {
          protocol: "A",
          text: "",
          cleanedText: "",
          usage: { input: 0, output: 0 },
          durationMs: 0,
          verdict: "FORGOT",
          verdictLabel: "⚠️  请求失败",
          error: aRes.reason instanceof Error ? aRes.reason.message : String(aRes.reason),
        };
  const b: SideResult =
    bRes.status === "fulfilled"
      ? toSide("B", bRes.value, judgeCase3)
      : {
          protocol: "B",
          text: "",
          cleanedText: "",
          usage: { input: 0, output: 0 },
          durationMs: 0,
          verdict: "FORGOT",
          verdictLabel: "⚠️  请求失败",
          error: bRes.reason instanceof Error ? bRes.reason.message : String(bRes.reason),
        };

  return {
    caseName: "case3-no-history",
    system: null,
    user: "(2 轮 user，中间隔一层 assistant 未塞回)",
    turns,
    a,
    b,
  };
}

// ── 11) koa + router + static ──
const app = new Koa();
const router = new Router();

// 11.1) bodyparser（§5.3.5 显式声明 body 解析）
app.use(bodyParser());

// 11.2) GET /health
router.get("/health", (ctx: Context) => {
  ctx.body = {
    ok: true,
    a: { baseURL: llm.baseUrlA, model: llm.modelA },
    b: {
      baseURL: llm.baseUrlB,
      model: llm.modelB,
      maxTokens: llm.maxTokensB,
    },
  };
});

// 11.3) POST /api/case1-priority
router.post("/api/case1-priority", async (_ctx: Context, _next: Next) => {
  const result = await runCase1();
  _ctx.body = result;
});

// 11.4) POST /api/case2-with-history
router.post("/api/case2-with-history", async (_ctx: Context, _next: Next) => {
  const result = await runCase2();
  _ctx.body = result;
});

// 11.5) POST /api/case3-no-history
router.post("/api/case3-no-history", async (_ctx: Context, _next: Next) => {
  const result = await runCase3();
  _ctx.body = result;
});

app.use(router.routes()).use(router.allowedMethods());

// 11.6) 静态资源（public/index.html）—— React 代码已在 HTML 内联
//   § 关键：serve 第一个参数必须绝对路径；相对路径是相对 process.cwd()，不可靠
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

// ── 12) 启动 ──
app.listen(PORT, "127.0.0.1", () => {
  console.log(
    "──── 模块 03 · 01 System / User / Assistant 优先级 Demo（§5.3 React + koa · HTML 内联块）· 已启动 ────",
  );
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  POST /api/case1-priority     → 优先级对照（System JSON-only vs User 长文段）`);
  console.log(`  POST /api/case2-with-history → 多轮 WITH assistant 历史`);
  console.log(`  POST /api/case3-no-history   → 多轮 WITHOUT assistant 历史（失忆对照组）`);
  console.log(`  GET  /health                 → 环境信息`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
