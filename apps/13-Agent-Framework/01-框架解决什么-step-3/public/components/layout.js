/**
 * 职责：各页共用的说明区、状态徽标、页脚环境信息。
 * 数据流：PageIntro 吃教学文案；StatusPill 吃四态；EnvFooter 加载 GET /health 填端口 / 模型服务商 / 模型 / 密钥。
 *
 * 加载方式：本文件用 HTM 写（`html\`...\`` 是 tagged template literal），
 *   浏览器原生执行，不需要 Babel 转译；
 *   agent-loop.html 里以 <script type="module" src=...> 加载即可。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const PILL_MAP = {
  idle: { cls: "bg-gray-200 text-gray-700", text: "⏸ 待连接" },
  loading: { cls: "bg-blue-100 text-blue-800", text: "🔄 请求中" },
  ok: { cls: "bg-green-100 text-green-800", text: "✅ 完成" },
  error: { cls: "bg-red-100 text-red-800", text: "❌ 错误" },
};

export function StatusPill(props) {
  const status = props.status || "idle";
  const item = PILL_MAP[status] || PILL_MAP.idle;
  return html`
    <span id="status-pill" className=${"text-xs px-2 py-1 rounded " + item.cls}>
      ${item.text}
    </span>
  `;
}

export function PageIntro(props) {
  return html`
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">本页只演示：<b>${props.lead}</b></p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        ${(props.steps || []).map(function (step, i) {
          return html`<li key=${i}>${step}</li>`;
        })}
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">${props.takeaway}</div>
        <div className="text-xs text-gray-600">${props.observe}</div>
      </div>
    </section>
  `;
}

export function EnvFooter(props) {
  const env = props.env || {};
  const port = env.port || 50141;
  const provider = env.provider || "（待连接）";
  const model = env.model || "（待连接）";
  const keyText = env.hasKey ? "密钥 ✅" : "密钥 ❌（apps/.env 未配置该家密钥）";
  return html`
    <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
      <span id="env-info">
        端口 ${port} · 协议 A（openai Chat Completions） · 模型服务商 ${provider} · 模型 ${model} · ${keyText}
      </span>
    </footer>
  `;
}