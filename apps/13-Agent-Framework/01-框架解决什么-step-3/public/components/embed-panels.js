/**
 * 职责：嵌入模型向量化子页前两个面板（模式 A embed 单条 / 模式 B embedMany 批量）。
 * 数据流：浏览器 fetch POST /api/embed · /api/embed-many → 各自独立 React state → 渲染响应。
 *
 * 加载方式：HTM 写，浏览器原生执行。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const PROVIDERS = [
  { id: "minimax", label: "MiniMax（默认）" },
  { id: "zhipu", label: "智谱 GLM" },
  { id: "qwen", label: "千问 DashScope" },
  { id: "deepseek", label: "DeepSeek（无嵌入接口，仅用于对照）" },
];

function StatusBadge(props) {
  const status = props.status || "idle";
  const cls = status === "loading" ? "bg-blue-100 text-blue-800"
    : status === "ok" ? "bg-green-100 text-green-800"
    : status === "error" ? "bg-red-100 text-red-800"
    : "bg-gray-200 text-gray-700";
  const text = status === "loading" ? "🔄 请求中"
    : status === "ok" ? "✅ 完成"
    : status === "error" ? "❌ 错误"
    : "⏸ 待连接";
  return html`<span id="status-pill" className=${"text-xs px-2 py-1 rounded " + cls}>${text}</span>`;
}

export function EmbedPanel() {
  const [provider, setProvider] = React.useState("minimax");
  const [text, setText] = React.useState("来一杯中杯热拿铁");
  const [status, setStatus] = React.useState("idle");
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");
  const [elapsed, setElapsed] = React.useState(null);

  async function run() {
    if (!text.trim()) return;
    setStatus("loading");
    setError("");
    setResult(null);
    setElapsed(null);
    const started = Date.now();
    try {
      const res = await fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, provider: provider }),
      });
      const data = await res.json();
      setElapsed(Date.now() - started);
      if (!res.ok) { setError("HTTP " + res.status + " " + ((data && data.error) || "")); setStatus("error"); return; }
      setResult(data);
      setStatus(data.ok ? "ok" : "error");
    } catch (err) {
      setError((err && err.message) || String(err));
      setStatus("error");
    }
  }

  const preview = result && result.embedding
    ? result.embedding.slice(0, 12).map(function (n) { return n.toFixed(4); }).join(", ") + ", ..."
    : "（未跑）";
  const summary = result ? {
    ok: result.ok, provider: result.provider, embeddingModel: result.embeddingModel,
    dim: result.dim, embeddingPreview: preview, usage: result.usage, elapsedMs: result.elapsedMs,
  } : null;

  return html`
    <div className="bg-white shadow rounded p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-700">模式 A · embed 单条</div>
        <${StatusBadge} status=${status} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="embed-provider" className="block text-xs text-gray-600">提供商（provider）</label>
          <select id="embed-provider" className="w-full border border-gray-300 rounded p-1.5 text-sm bg-white" value=${provider} onChange=${function (e) { setProvider(e.target.value); }}>
            ${PROVIDERS.map(function (p) { return html`<option key=${p.id} value=${p.id}>${p.label}</option>`; })}
          </select>
        </div>
        <div>
          <label htmlFor="embed-text" className="block text-xs text-gray-600">待嵌入的字符串（value）</label>
          <input id="embed-text" className="w-full border border-gray-300 rounded p-1.5 text-sm" value=${text} onChange=${function (e) { setText(e.target.value); }} />
        </div>
      </div>
      <button id="btn-run-embed" className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50" disabled=${status === "loading" || !text.trim()} onClick=${run}>
        ${status === "loading" ? "正在嵌入…" : "跑一次 embed"}
      </button>
      <div className="bg-gray-50 border border-gray-200 rounded p-3">
        <div className="text-xs font-semibold text-gray-700">响应（一次性 JSON · 不推流）</div>
        <pre className="text-xs text-gray-800 whitespace-pre-wrap mt-1 max-h-[240px] overflow-auto">${summary ? JSON.stringify(summary, null, 2) : "（未跑）"}</pre>
      </div>
      ${error ? html`<p className="text-sm text-red-700">${error}</p>` : null}
    </div>
  `;
}

export function EmbedManyPanel() {
  const [provider, setProvider] = React.useState("minimax");
  const [docsText, setDocsText] = React.useState([
    "今日菜单：中杯热拿铁 ¥28",
    "今日菜单：大杯冰美式 ¥22",
    "小程序的会员卡余额 ¥50；今日扣款次数 0",
    "今日会员卡累计：-¥28；扣款次数 1",
    "今日外卖订单：暂无",
    "操作指南：客人点冰饮时改用冰饮制作节点",
  ].join("\n"));
  const [status, setStatus] = React.useState("idle");
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");
  const [elapsed, setElapsed] = React.useState(null);

  async function run() {
    const texts = docsText.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    if (texts.length === 0) return;
    setStatus("loading");
    setError("");
    setResult(null);
    setElapsed(null);
    const started = Date.now();
    try {
      const res = await fetch("/api/embed-many", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: texts, provider: provider }),
      });
      const data = await res.json();
      setElapsed(Date.now() - started);
      if (!res.ok) { setError("HTTP " + res.status + " " + ((data && data.error) || "")); setStatus("error"); return; }
      setResult(data);
      setStatus(data.ok ? "ok" : "error");
    } catch (err) {
      setError((err && err.message) || String(err));
      setStatus("error");
    }
  }

  const preview = result && result.embeddings && result.embeddings[0]
    ? result.embeddings[0].slice(0, 8).map(function (n) { return n.toFixed(4); }).join(", ") + ", ..."
    : "—";
  const summary = result ? {
    ok: result.ok, provider: result.provider, embeddingModel: result.embeddingModel,
    dim: result.dim, count: result.count, embeddingPreview: preview,
    usage: result.usage, elapsedMs: result.elapsedMs,
  } : null;

  return html`
    <div className="bg-white shadow rounded p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-700">模式 B · embedMany 批量</div>
        <${StatusBadge} status=${status} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="embedmany-provider" className="block text-xs text-gray-600">提供商（provider）</label>
          <select id="embedmany-provider" className="w-full border border-gray-300 rounded p-1.5 text-sm bg-white" value=${provider} onChange=${function (e) { setProvider(e.target.value); }}>
            ${PROVIDERS.map(function (p) { return html`<option key=${p.id} value=${p.id}>${p.label}</option>`; })}
          </select>
        </div>
        <div>
          <label htmlFor="embedmany-docs" className="block text-xs text-gray-600">待嵌入的字符串数组（values · 一行一条）</label>
          <textarea id="embedmany-docs" className="w-full border border-gray-300 rounded p-2 text-sm font-mono" rows=${5} value=${docsText} onChange=${function (e) { setDocsText(e.target.value); }} />
        </div>
      </div>
      <button id="btn-run-embed-many" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50" disabled=${status === "loading" || !docsText.trim()} onClick=${run}>
        ${status === "loading" ? "正在批量嵌入…" : "跑一次 embedMany"}
      </button>
      <div className="bg-gray-50 border border-gray-200 rounded p-3">
        <div className="text-xs font-semibold text-gray-700">响应（一次性 JSON · 二维向量数组 + 聚合 token）</div>
        <pre className="text-xs text-gray-800 whitespace-pre-wrap mt-1 max-h-[240px] overflow-auto">${summary ? JSON.stringify(summary, null, 2) : "（未跑）"}</pre>
      </div>
      ${error ? html`<p className="text-sm text-red-700">${error}</p>` : null}
    </div>
  `;
}