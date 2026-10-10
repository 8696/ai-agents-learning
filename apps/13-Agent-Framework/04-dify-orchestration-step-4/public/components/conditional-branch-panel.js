/**
 * 职责：左栏「手写条件分支」面板 —— 展示按 intent 选边的结果，**不拦非法转移**。
 * 数据流：吃 props.result（intent / paymentStatus / chosenRoute / allowed / reason / source），回返渲染。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 *
 * 教学点：条件分支 ≠ 边表核对 —— 条件分支只按 intent 选边，没核对 declared edgeTable。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

export function ConditionalBranchPanel(props) {
  const r = props.result;
  return html`
    <section className="border-2 rounded p-4 space-y-3 border-amber-300 bg-amber-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-amber-900">左栏 · 手写条件分支</h2>
        <span className="text-xs px-2 py-1 rounded border font-semibold bg-amber-100 text-amber-800 border-amber-300">
          只按 intent 选边
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/conditional-branch，体 = {"{ intent, paymentStatus }"}；服务端跑 <code>runConditionalBranch</code> —— 只按 intent 选边，不核对 declared edgeTable。
      </div>

      ${r ? html`
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">意图（intent）</div>
            <div className="text-base">${r.intent}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">付款状态（paymentStatus）</div>
            <div className="text-base">${r.paymentStatus}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">选出来的下一站（chosenRoute）</div>
            <div className="text-base text-amber-700">${r.chosenRoute}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">放行 / 拒绝</div>
            <div className=${"text-base " + (r.allowed ? "text-green-700" : "text-red-700")}>${r.allowed ? "✅ 放行（条件分支不拦）" : "❌ 拒绝"}</div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded p-2 text-xs">
          <div className="font-semibold text-gray-700">出处（source）</div>
          <div className="text-gray-700">${r.source}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded p-2 text-xs">
          <div className="font-semibold text-gray-700">判据（reason）</div>
          <div className="text-gray-700">${r.reason}</div>
        </div>
      ` : html`<div className="text-xs text-gray-500 italic">（点按钮跑完才有结果）</div>`}

      <div className="border-2 border-dashed border-red-300 bg-red-50 rounded p-2 text-xs text-red-800">
        条件分支 ≠ 边表核对 —— 这里没核对 declared edgeTable，「未付款想出品」也会按 intent 选出来走过去。
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="bg-black text-white px-4 py-2 rounded disabled:opacity-50" disabled=${props.busy} onClick=${props.onSubmit}>
          跑（POST /api/conditional-branch）
        </button>
        <button className="border border-gray-300 px-4 py-2 rounded disabled:opacity-50" disabled=${props.busy} onClick=${props.onReset}>
          清空这一栏
        </button>
      </div>

      ${props.errorText ? html`<div className="border border-red-300 bg-red-50 text-red-800 text-sm rounded p-2">${props.errorText}</div>` : null}
    </section>
  `;
}