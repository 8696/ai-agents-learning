// ────────────────────────────────────────────────────────────────────────────
// JSON Schema · 01 · Zod 端的"返回值长什么样"
// ────────────────────────────────────────────────────────────────────────────
// 配套沉淀：docs/学习模块/04-Structured-Output/01-JSON-Schema.md
// 跑法     ：cd apps && yarn app:04-01-json-schema
//
// 这条只验证"Zod 怎么校验 / 怎么报 issue / 怎么推导类型"，不调 LLM API。
// 真正的"模型 → schema → 解析"闭环看 02（JSON Mode vs Structured Output）。
// ────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── 1) Zod 这一端：类型 / optional / enum / default ────────────────────────────
const Intent = z.object({
  action: z.enum(["search", "order", "cancel"]).default("search"),
  query: z.string().min(1),
  qty: z.number().int().positive().optional(),
});

// z.infer 推导（注意 default 与 optional 在类型上的方向相反）
//   type Intent = {
//     action: "search" | "order" | "cancel";
//     query: string;
//     qty?: number | undefined;
//   }

// ── 2) 同一份契约写成 JSON Schema（手写派生，生产用 `zod-to-json-schema`）────
// 这是你要塞给 OpenAI / Anthropic 的那份 schema；本条用 literal 写，
// 不引外部依赖、不增加包大小。生产代码里通常这么写：
//   import { zodToJsonSchema } from "zod-to-json-schema";
//   const intentJsonSchema = zodToJsonSchema(Intent, "Intent");
const intentJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $ref: "#/$defs/Intent",
  $defs: {
    Intent: {
      type: "object",
      required: ["query"],
      properties: {
        action: {
          type: "string",
          enum: ["search", "order", "cancel"],
          default: "search",
        },
        query: { type: "string", minLength: 1 },
        qty: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
  },
} as const;

console.log("① 同一份契约写成的 JSON Schema（喂给 LLM SDK 的样子）");
console.log("   schema name =", intentJsonSchema.$defs.Intent);
console.log("   required    =", intentJsonSchema.$defs.Intent.required);
console.log("   qty optional = 不在 required 里 → JSON Schema 默认全可选");
console.log();

// ── 3) parse 成功路径：返回 typed 对象，TS 自动收窄 ───────────────────────────
const ok = Intent.parse({ action: "order", query: "奶茶", qty: 2 });

console.log("② parse 成功返回值:");
console.log("   value =", ok);
//   { action: 'order', query: '奶茶', qty: 2 }
//
// 静态类型由 Intent 推出，下面这一行 TS 编译器会收窄：
//   ok.action 只能是 "search" | "order" | "cancel" 之一
const cmdUpper: "SEARCH" | "ORDER" | "CANCEL" = ok.action.toUpperCase() as never;
console.log("   ok.action (type-narrowed) =", ok.action, "→", cmdUpper);
console.log();

// ── 4) safeParse 失败路径：永不抛，返回 discriminated union ──────────────────
const bad = Intent.safeParse({ action: "BLOW_UP", query: "" });

console.log("③ safeParse 失败返回值:");
console.log("   success =", bad.success);
if (!bad.success) {
  console.log("   data 字段不存在（TS 已 narrow 走 false 分支，r.data 访问会报错）");
  console.log("   error 类型 = ZodError");
  console.log();
}

// ── 5) issues 形状：path + code + message，喂回模型做 repair ──────────────────
if (!bad.success) {
  console.log("④ issues 数组（逐条结构 + 给模型吃的 repair 文本）:");
  for (const issue of bad.error.issues) {
    console.log(
      `   - path=${(issue.path as (string | number)[]).join(".") || "(root)"}`
        + ` | code=${issue.code}`
        + ` | message=${issue.message}`,
    );
  }
  console.log();
  console.log("⑤ 给模型的 repair prompt（直接拼回 prompt 即可）:");
  const repairPrompt =
    "上一次的输出不符合 schema，错误：\n" +
    bad.error.issues
      .map((i) => `  - ${(i.path as (string | number)[]).join(".") || "(root)"}: ${i.message}`)
      .join("\n") +
    "\n请重新输出合法 JSON。";
  console.log("   " + repairPrompt.replace(/\n/g, "\n   "));
  console.log();
}

// ── 6) transform：schema 不只校验，还能改结构 ─────────────────────────────────
const Enriched = Intent.transform((o) => ({
  ...o,
  repaired: true,
  when: new Date().toISOString(),
}));

const enriched = Enriched.parse({ query: "咖啡" });
//   default 让 action 自动补 "search"；optional 的 qty 不出现就是 undefined

console.log("⑥ transform 之后（多了 repaired + when 字段）:");
console.log("   value =", enriched);
//   { action: 'search', query: '咖啡', repaired: true, when: '...' }
//
// TS 推导出的输出类型变成：
//   {
//     action: "search"|"order"|"cancel";
//     query: string;
//     qty?: number | undefined;
//     repaired: boolean;
//     when: string;
//   }
console.log();
console.log("✅ Demo 结束。本条纯结构性概念，全程未调 LLM API。");
