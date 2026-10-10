/**
 * 职责：右栏「代码节点 + 忘了写输出变量」面板 —— 展示 priceInCode 算成了但 outputVars 里没 price。
 * 数据流：吃 props.result（priceInCode / outputVars / note），回返渲染。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 *
 * 教学点：局部变量 priceInCode 函数返回就丢；下游能不能读到 = 看有没有写到 outputVars。
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

export function CodeNodeWithoutOutputPanel(props) {
  const r = props.result;
  const priceInOutput = r && typeof r.outputVars.price === "number";
  return html`
    <section className="border-2 rounded p-4 space-y-3 border-red-300 bg-red-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-red-900">右栏 · 忘了写输出变量</h2>
        <span className="text-xs px-2 py-1 rounded border font-semibold bg-red-100 text-red-800 border-red-300">
          price 算成了但没暴露
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/code-node-without-output，体 = {"{ cupSize, drinkType }"}；服务端跑 <code>runCodeNodeWithoutOutput</code> —— 代码节点里算了 price（局部变量），**但忘了写进 outputVars**。
      </div>

      ${r ? html`
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">代码内价格（priceInCode · 局部变量）</div>
            <div className="text-lg text-red-700">¥ ${r.priceInCode}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">outputVars 里 price</div>
            <div className=${"text-lg " + (priceInOutput ? "text-emerald-700" : "text-red-700")}>${priceInOutput ? "✅ ¥ " + r.outputVars.price : "❌ 没暴露（下游读不到）"}</div>
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

      <div className="border-2 border-dashed border-red-400 bg-red-100 rounded p-2 text-xs text-red-900">
        局部变量 priceInCode = ${r ? "¥ " + r.priceInCode : "—"}，但函数返回就丢。outputVars 里没 price → 下游读不到 → 回复节点 / 别的代码节点看到的是「没有价格」。
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50" disabled={props.busy} onClick={props.onSubmit}>
          跑（POST /api/code-node-without-output）
        </button>
        <button className="border border-gray-300 px-4 py-2 rounded disabled:opacity-50" disabled={props.busy} onClick={props.onReset}>
          清空这一栏
        </button>
      </div>

      ${props.errorText ? html`<div className="border border-red-300 bg-red-50 text-red-800 text-sm rounded p-2">${props.errorText}</div>` : null}
    </section>
  `;
}