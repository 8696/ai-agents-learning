/**
 * 职责：嵌入模型向量化子页余弦检索面板（模式 C · embed + embedMany + 余弦排序取 Top-K）。
 * 数据流：浏览器 fetch POST /api/cosine-recall → React state → 渲染 Top-K / 其余。
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

export function CosineRecallPanel() {
  const [provider, setProvider] = React.useState("minimax");
  const [query, setQuery] = React.useState("来一杯中杯热拿铁");
  const [docsText, setDocsText] = React.useState([
    "今日菜单：中杯热拿铁 ¥28",
    "今日菜单：大杯冰美式 ¥22",
    "小程序的会员卡余额 ¥50；今日扣款次数 0",
    "今日会员卡累计：-¥28；扣款次数 1",
    "今日外卖订单：暂无",
    "操作指南：客人点冰饮时改用冰饮制作节点",
  ].join("\n"));
  const [topK, setTopK] = React.useState(3);
  const [status, setStatus] = React.useState("idle");
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");

  async function run() {
    const documents = docsText.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!query.trim() || documents.length < 2) return;
    setStatus("loading");
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/cosine-recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query, documents: documents, topK: topK, provider: provider }),
      });
      const data = await res.json();
      if (!res.ok) { setError("HTTP " + res.status + " " + ((data && data.error) || "")); setStatus("error"); return; }
      setResult(data);
      setStatus(data.ok ? "ok" : "error");
    } catch (err) {
      setError((err && err.message) || String(err));
      setStatus("error");
    }
  }

  const top = result && result.top ? result.top : [];
  const rest = result && result.rest ? result.rest : [];

  return html`
    <div className="bg-white shadow rounded p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-700">模式 C · 余弦检索（embed + embedMany + 余弦排序取 Top-K）</div>
        <${StatusBadge} status=${status} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="recall-provider" className="block text-xs text-gray-600">提供商（provider）</label>
          <select id="recall-provider" className="w-full border border-gray-300 rounded p-1.5 text-sm bg-white" value=${provider} onChange=${function (e) { setProvider(e.target.value); }}>
            ${PROVIDERS.map(function (p) { return html`<option key=${p.id} value=${p.id}>${p.label}</option>`; })}
          </select>
        </div>
        <div>
          <label htmlFor="recall-topk" className="block text-xs text-gray-600">Top-K</label>
          <input id="recall-topk" type="number" min=${1} max=${10} className="w-full border border-gray-300 rounded p-1.5 text-sm" value=${topK} onChange=${function (e) { setTopK(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1))); }} />
        </div>
      </div>
      <div>
        <label htmlFor="recall-query" className="block text-xs text-gray-600">query（用户提问 · 单条嵌入）</label>
        <input id="recall-query" className="w-full border border-gray-300 rounded p-1.5 text-sm" value=${query} onChange=${function (e) { setQuery(e.target.value); }} />
      </div>
      <div>
        <label htmlFor="recall-docs" className="block text-xs text-gray-600">documents（候选文档库 · 一行一条 · 批量嵌入）</label>
        <textarea id="recall-docs" className="w-full border border-gray-300 rounded p-2 text-sm font-mono" rows=${5} value=${docsText} onChange=${function (e) { setDocsText(e.target.value); }} />
      </div>
      <button id="btn-run-recall" className="bg-emerald-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50" disabled=${status === "loading" || !query.trim()} onClick=${run}>
        ${status === "loading" ? "正在嵌入 + 排序…" : "跑一次余弦检索"}
      </button>
      <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-2">
        <div className="text-xs font-semibold text-gray-700">Top-K（按余弦相似度降序）</div>
        ${top.length === 0
          ? html`<div className="text-xs text-gray-500">（未跑）</div>`
          : html`<ol className="text-xs text-gray-800 list-decimal pl-5 space-y-1">${top.map(function (item) {
              return html`<li key=${item.index}><span className="font-mono">score=${item.score.toFixed(4)}</span> · ${item.document}</li>`;
            })}</ol>`
        }
      </div>
      ${rest.length > 0
        ? html`
          <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-700">其余（按余弦相似度降序 · 没进 Top-K）</div>
            <ol className="text-xs text-gray-800 list-decimal pl-5 space-y-1">
              ${rest.map(function (item) {
                return html`<li key=${item.index}><span className="font-mono">score=${item.score.toFixed(4)}</span> · ${item.document}</li>`;
              })}
            </ol>
          </div>
        `
        : null
      }
      ${error ? html`<p className="text-sm text-red-700">${error}</p>` : null}
    </div>
  `;
}