/**
 * 职责：step-5 加 page 组件 —— 「正确 vs 反例 · 状态写在哪」面板（双栏对照）。
 * 数据流：吃 props.result（pollutedGlobalConfig / globalConfigSnapshot / declaredState / note），回返渲染。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

function ConfigTable(props) {
  const cfg = props.config || {};
  const keys = Object.keys(cfg);
  if (keys.length === 0) {
    return html`<div className="text-xs text-gray-500 italic">（GLOBAL_CONFIG 为空 —— 没被污染）</div>`;
  }
  return html`
    <div className="bg-white border border-gray-200 rounded p-2 space-y-1 text-xs font-mono">
      ${keys.map(function (k) {
        return html`
          <div key=${k} className="flex items-center gap-2">
            <span className="text-gray-600">${k}</span>
            <span className="text-gray-400">=</span>
            <span className="text-gray-800">${JSON.stringify(cfg[k])}</span>
          </div>
        `;
      })}
    </div>
  `;
}

export function GlobalEnvVsStatePanel(props) {
  const r = props.result;
  const polluted = r && r.pollutedGlobalConfig;
  return html`
    <section className=${"border-2 rounded p-4 space-y-3 " + (polluted ? "border-red-300 bg-red-50" : "border-emerald-300 bg-emerald-50")}>
      <div className="flex items-center justify-between">
        <h2 className=${"text-sm font-semibold " + (polluted ? "text-red-900" : "text-emerald-900")}>${props.title}</h2>
        <span className=${"text-xs px-2 py-1 rounded border font-semibold " + (polluted ? "bg-red-100 text-red-800 border-red-300" : "bg-emerald-100 text-emerald-800 border-emerald-300")}>
          ${polluted ? "污染了 GLOBAL_CONFIG" : "GLOBAL_CONFIG 不变"}
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/global-env-vs-state，体 = {"{ cupSize, drinkType, side: 'correct' / 'polluted' }"}；服务端跑 <code>${polluted ? "runStatePollutedToGlobal" : "runStateInDeclaredState"}</code>。
      </div>

      ${r ? html`
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">本趟价格（price）</div>
            <div className="text-lg ${polluted ? "text-red-700" : "text-emerald-700"}">¥ ${r.price}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">是否污染 GLOBAL_CONFIG</div>
            <div className=${"text-base " + (polluted ? "text-red-700" : "text-emerald-700")}>${polluted ? "❌ 是（cup_size=" + r.pollutedValue + " 写进了全局）" : "✅ 否（cup_size 没写进全局）"}</div>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-1">本趟 declared state（应该在哪）</div>
          <div className="bg-white border border-gray-200 rounded p-2 space-y-1 text-xs font-mono">
            ${Object.keys(r.declaredState).map(function (k) {
              return html`<div key=${k} className="flex items-center gap-2"><span className="text-gray-600">${k}</span><span className="text-gray-400">=</span><span className="text-gray-800">${JSON.stringify(r.declaredState[k])}</span></div>`;
            })}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-1">GLOBAL_CONFIG（不该放这一趟字段的地方）</div>
          <${ConfigTable} config=${r.globalConfigSnapshot} />
        </div>
        <div className="bg-white border border-gray-200 rounded p-2 text-xs">
          <div className="font-semibold text-gray-700">判据（note）</div>
          <div className="text-gray-700">${r.note}</div>
        </div>
      ` : html`<div className="text-xs text-gray-500 italic">（点按钮跑完才有结果）</div>`}

      <div className=${"border-2 border-dashed rounded p-2 text-xs " + (polluted ? "border-red-400 bg-red-100 text-red-900" : "border-emerald-400 bg-emerald-100 text-emerald-900")}>
        ${polluted ? "这一趟的 cupSize 写进 GLOBAL_CONFIG（模拟 process.env）—— 下次跑会读到上次的 cupSize。密钥混进全局 = 配置类污染。" : "状态写在 declared state 里 —— 全局不变，下次跑读不到上次。"}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className=${polluted ? "bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50" : "bg-emerald-600 text-white px-4 py-2 rounded disabled:opacity-50"} disabled={props.busy} onClick={props.onSubmit}>
          跑（POST /api/global-env-vs-state · side=${props.side}）
        </button>
        <button className="border border-gray-300 px-4 py-2 rounded disabled:opacity-50" disabled={props.busy} onClick={props.onReset}>
          清空这一栏
        </button>
      </div>

      ${props.errorText ? html`<div className="border border-red-300 bg-red-50 text-red-800 text-sm rounded p-2">${props.errorText}</div>` : null}
    </section>
  `;
}