/**
 * 职责：左栏「代码节点 + 写出输出变量」面板 —— 展示代码节点内部算出的 price + 已写进 outputVars.price。
 * 数据流：吃 props.result（priceInCode / outputVars / note），回返渲染。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 *
 * 教学点：必须显式写进输出变量 outputVars.price，引擎才会合并进全图状态，下游能读到。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

function VarsTable(props) {
  const v = props.outputVars || {};
  const keys = Object.keys(v);
  if (keys.length === 0) {
    return html`<div className="text-xs text-gray-500 italic">（无输出变量）</div>`;
  }
  return html`
    <div className="bg-white border border-gray-200 rounded p-2 space-y-1 text-xs font-mono">
      ${keys.map(function (k) {
        return html`
          <div key=${k} className="flex items-center gap-2">
            <span className="text-gray-600">${k}</span>
            <span className="text-gray-400">=</span>
            <span className="text-gray-800">${JSON.stringify(v[k])}</span>
          </div>
        `;
      })}
    </div>
  `;
}

export function CodeNodeWithOutputPanel(props) {
  const r = props.result;
  const priceInOutput = r && typeof r.outputVars.price === "number";
  return html`
    <section className="border-2 rounded p-4 space-y-3 border-emerald-300 bg-emerald-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-emerald-900">左栏 · 写出输出变量</h2>
        <span className="text-xs px-2 py-1 rounded border font-semibold bg-emerald-100 text-emerald-800 border-emerald-300">
          price 写进了 outputVars
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/code-node-with-output，体 = {"{ cupSize, drinkType }"}；服务端跑 <code>runCodeNodeWithOutput</code> —— 代码节点里算出 price，**且写进输出变量 outputVars.price**。
      </div>

      ${r ? html`
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">代码内价格（priceInCode · 局部变量）</div>
            <div className="text-lg text-emerald-700">¥ ${r.priceInCode}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">outputVars 里 price</div>
            <div className=${"text-lg " + (priceInOutput ? "text-emerald-700" : "text-red-700")}>${priceInOutput ? "✅ ¥ " + r.outputVars.price + "（下游能读到）" : "❌ 没暴露"}</div>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-1">输出变量（outputVars · 下游能读到的字段）</div>
          <${VarsTable} outputVars=${r.outputVars} />
        </div>
        <div className="bg-white border border-gray-200 rounded p-2 text-xs">
          <div className="font-semibold text-gray-700">判据（note）</div>
          <div className="text-gray-700">${r.note}</div>
        </div>
      ` : html`<div className="text-xs text-gray-500 italic">（点按钮跑完才有结果）</div>`}

      <div className="border-2 border-dashed border-emerald-400 bg-emerald-100 rounded p-2 text-xs text-emerald-900">
        代码节点里 price 写进了输出变量 → 下游能读到 → 整个图的 state 有价格。
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="bg-emerald-600 text-white px-4 py-2 rounded disabled:opacity-50" disabled={props.busy} onClick={props.onSubmit}>
          跑（POST /api/code-node-with-output）
        </button>
        <button className="border border-gray-300 px-4 py-2 rounded disabled:opacity-50" disabled={props.busy} onClick={props.onReset}>
          清空这一栏
        </button>
      </div>

      ${props.errorText ? html`<div className="border border-red-300 bg-red-50 text-red-800 text-sm rounded p-2">${props.errorText}</div>` : null}
    </section>
  `;
}