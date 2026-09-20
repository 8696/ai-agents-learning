#!/usr/bin/env node
/**
 * 一次性验证脚本（2026-09-20）。
 *
 * 职责：把 4 家提供商 × 2 协议的最终 API 地址都写成字面量，逐个打一次「你好」验证连通。
 *   API 地址写死；Key 与模型 id 从 apps/.env 读。
 *
 * 数据流：读 apps/.env → 按 8 行字面量顺序 POST → 打 console.log 表格。
 *   OpenAI 协议：Authorization: Bearer <KEY>，body = { model, max_tokens:60, messages:[{role:"user",content:"你好"}] }
 *   Anthropic 协议：x-api-key: <KEY> + anthropic-version: 2023-06-01，body 同上
 *
 * 为什么是写死而不是走 apps/llm.ts 的 CATALOG：
 *   CATALOG 假设 baseURL 拼接策略固定，但实际 OpenAI 是 ${baseURL}/chat/completions、
 *   Anthropic 是 ${baseURLWithV1}/messages（baseURLWithV1 = 给 baseUrlB 手动补 /v1）。
 *   一次性验证脚本不引入新的拼接策略，只把 8 个真实验证过的 URL 列成字面量。
 *
 * 用法（在仓库根目录）：
 *   node scripts/probe-all-providers.js
 */
const fs = require("node:fs");
const path = require("node:path");

// ── 8 个最终 API 地址（写死；与 apps/13-Agent-Framework/01-框架解决什么-step-2 配套校验）──
const URLS = {
  openai: {
    minimax:  "https://api.minimaxi.com/v1/chat/completions",
    zhipu:    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    deepseek: "https://api.deepseek.com/chat/completions",
    qwen:     "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  },
  anthropic: {
    minimax:  "https://api.minimaxi.com/anthropic/v1/messages",
    zhipu:    "https://open.bigmodel.cn/api/anthropic/v1/messages",
    deepseek: "https://api.deepseek.com/anthropic/v1/messages",
    qwen:     "https://dashscope.aliyuncs.com/apps/anthropic/v1/messages",
  },
};

const PROVIDERS = ["minimax", "zhipu", "deepseek", "qwen"];

// ── 读 apps/.env ──
const ENV_PATH = path.resolve(__dirname, "..", "apps", ".env");
const env = {};
fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/).forEach(function (line) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !line.startsWith("#")) env[m[1]] = m[2];
});

function envKey(provider) {
  return env[provider.toUpperCase() + "_API_KEY"];
}
function envModel(provider) {
  return env[provider.toUpperCase() + "_MODEL"];
}

// ── 逐家打一次 ──
async function callOnce(provider, protocol) {
  const url = URLS[protocol][provider];
  const key = envKey(provider);
  const model = envModel(provider);
  if (!key) return { ok: false, url, status: 0, ms: 0, note: "缺 Key（" + provider.toUpperCase() + "_API_KEY 未在 .env 填）" };
  if (!model) return { ok: false, url, status: 0, ms: 0, note: "缺模型 id（" + provider.toUpperCase() + "_MODEL 未在 .env 填）" };

  const body = JSON.stringify({
    model,
    max_tokens: 60,
    messages: [{ role: "user", content: "你好" }],
  });
  const headers = protocol === "openai"
    ? { "Content-Type": "application/json", "Authorization": "Bearer " + key }
    : { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body });
  } catch (e) {
    return { ok: false, url, status: 0, ms: Date.now() - t0, note: "fetch 抛错：" + e.message };
  }
  const ms = Date.now() - t0;

  let payload;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, url, status: res.status, ms, note: "响应不是 JSON" };
  }

  // 字段位置（OpenAI / Anthropic 两套 schema 都查一遍，方便对照差异）
  const oaContent = payload?.choices?.[0]?.message?.content || "";
  const oaReasoning = payload?.choices?.[0]?.message?.reasoning_content || "";
  const anContent = Array.isArray(payload?.content) ? payload.content : [];
  const anText = anContent.filter(function (c) { return c.type === "text"; }).map(function (c) { return c.text; }).join("");
  const anThinking = anContent.filter(function (c) { return c.type === "thinking"; }).map(function (c) { return c.thinking; }).join("");

  // 主回复：OpenAI 取 content，Anthropic 取 type=text
  const reply = protocol === "openai" ? oaContent : anText;

  return {
    ok: res.ok,
    url,
    status: res.status,
    ms,
    reply,
    fields: {
      content: oaContent,
      reasoning_content: oaReasoning,
      content_text: anText,
      content_thinking: anThinking,
    },
  };
}

function truncate(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function main() {
  console.log("目标：4 家提供商 × 2 协议 = 8 个最终 API 地址；问句：「你好」；max_tokens=60。\n");
  console.log("─".repeat(110));
  for (const protocol of ["openai", "anthropic"]) {
    const protoLabel = protocol === "openai" ? "协议 A · OpenAI 兼容" : "协议 B · Anthropic 兼容";
    console.log("\n[" + protoLabel + "]");
    console.log("─".repeat(110));
    for (const provider of PROVIDERS) {
      const r = await callOnce(provider, protocol);
      if (r.note) {
        console.log("[跳过] " + provider + " · " + r.note);
        continue;
      }
      const statusMark = r.ok ? "✓" : "✗";
      const replyText = r.reply ? truncate(r.reply, 60) : "(空)";
      console.log(
        "[" + statusMark + " " + r.status + " " + String(r.ms).padStart(5, " ") + "ms] " +
        provider.padEnd(9) + " | reply = " + JSON.stringify(replyText)
      );
      // 把「思考放在哪」也打出来，方便对照协议差异
      if (protocol === "openai") {
        if (r.fields.reasoning_content) console.log("           reasoning_content = " + JSON.stringify(truncate(r.fields.reasoning_content, 60)));
      } else {
        if (r.fields.content_thinking) console.log("           content[type=thinking] = " + JSON.stringify(truncate(r.fields.content_thinking, 60)));
      }
    }
  }
  console.log("\n" + "─".repeat(110));
  console.log("全部 8 个 URL 是字面量；Key / 模型 id 来自 " + ENV_PATH);
}

main().catch(function (e) {
  console.error("脚本异常：" + e.message);
  process.exit(1);
});
