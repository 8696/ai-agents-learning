/**
 * 职责：工具调用循环 / 工具渐进子页的控件区。query 输入 + provider / protocol 下拉 + 可选 mode 下拉 + 「跑一次 / 中途取消」按钮。
 *
 * 数据流：props.state = { query, provider, protocol, mode, status, noKey }；
 *   props.dispatchers = { setQuery, setProvider, setProtocol, setMode, run, cancelAll }（setMode 可选）；
 *   props.modeOptions = [{ id, label }]（可选；不传就不显示 mode 下拉）；
 *   props.modeLabel = 「模式（mode）」。控件纯展示，所有 state 都在主页 App 里。
 *
 * 加载方式：本文件用 HTM 写（`html\`...\`` 是 tagged template literal），
 *   浏览器原生执行，不需要 Babel 转译；agent-loop.html / agent-prepare-step.html
 *   里以 <script type="module" src=...> 加载即可。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const PROVIDERS = [
  { id: "minimax", label: "MiniMax（默认）" },
  { id: "zhipu", label: "智谱 GLM" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "qwen", label: "千问 DashScope" },
];
const PROTOCOLS = [
  { id: "openai", label: "协议 A · OpenAI 兼容（Chat Completions）" },
  { id: "anthropic", label: "协议 B · Anthropic 兼容（Messages API）" },
];

export function ControlsPanel(props) {
  const state = props.state;
  const d = props.dispatchers;
  const busy = state.status === "loading";
  const showMode = Array.isArray(props.modeOptions) && props.modeOptions.length > 0;
  return html`
    <section id="controls-panel" className="bg-white shadow rounded p-4 space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <label htmlFor="provider-select" className="block text-sm text-gray-700">提供商（provider）</label>
        <select
          id="provider-select"
          className="border border-gray-300 rounded p-1.5 text-sm bg-white"
          value=${state.provider}
          onChange=${function (e) { d.setProvider(e.target.value); }}
        >
          ${PROVIDERS.map(function (p) {
            return html`<option key=${p.id} value=${p.id}>${p.label}</option>`;
          })}
        </select>
        <label htmlFor="protocol-select" className="block text-sm text-gray-700">协议（protocol）</label>
        <select
          id="protocol-select"
          className="border border-gray-300 rounded p-1.5 text-sm bg-white"
          value=${state.protocol}
          onChange=${function (e) { d.setProtocol(e.target.value); }}
        >
          ${PROTOCOLS.map(function (p) {
            return html`<option key=${p.id} value=${p.id}>${p.label}</option>`;
          })}
        </select>
        ${showMode ? html`
          <label htmlFor="mode-select" className="block text-sm text-gray-700">${props.modeLabel || "模式（mode）"}</label>
          <select
            id="mode-select"
            className="border border-gray-300 rounded p-1.5 text-sm bg-white"
            value=${state.mode}
            onChange=${function (e) { d.setMode(e.target.value); }}
          >
            ${props.modeOptions.map(function (m) {
              return html`<option key=${m.id} value=${m.id}>${m.label}</option>`;
            })}
          </select>
        ` : null}
        <span className="text-xs text-gray-500">
          当前 <code>${state.provider}</code> · <code>${state.protocol}</code>${showMode ? " · " + html`<code>${state.mode}</code>` : null}
          （${state.protocol === "openai" ? ".env 的 XXX_BASE_URL + XXX_MODEL" : ".env 的 XXX_ANTHROPIC_BASE_URL + XXX_ANTHROPIC_MODEL"}）
        </span>
      </div>
      <label htmlFor="query-input" className="block text-sm text-gray-700">query（左右两栏共用）</label>
      <textarea
        id="query-input"
        className="w-full border border-gray-300 rounded p-2 text-sm"
        rows=${2}
        value=${state.query}
        onChange=${function (e) { d.setQuery(e.target.value); }}
      ></textarea>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          id="btn-run"
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          disabled=${!state.query.trim() || state.noKey || busy}
          onClick=${d.run}
        >
          ${busy
            ? html`
                <span>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>
                  正在跑…（左 + 右 两个 streamText）
                </span>
              `
            : "跑一次（左右并发打 /api/${props.endpoint || 'agent-loop'}）"}
        </button>
        <button
          id="btn-cancel"
          className="bg-red-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          disabled=${!busy}
          onClick=${d.cancelAll}
        >
          中途取消（abort）
        </button>
        ${state.noKey ? html`<p className="text-xs text-red-700">缺 密钥，按钮已禁用。请配 apps/.env。</p>` : null}
      </div>
    </section>
  `;
}