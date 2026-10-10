/**
 * 职责：右栏「手写边表核对」面板 —— 展示按 declared edgeTable 核对后的结果，**拒绝不在名单的下一站**。
 * 数据流：吃 props.result（chosenRoute / nextNode / allowed / reason / source / edgeTable），回返渲染。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 *
 * 教学点：拦截按你 declared 的边表说了算；不在边表里 = 拒绝非法转移；不能脑补「产品会拦」。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

function EdgeTableView(props) {
  const t = props.edgeTable || {};
  const keys = Object.keys(t);
  if (keys.length === 0) return html`<div className="text-xs text-gray-500 italic">（无 declared 边表）</div>`;
  return html`
    <div className="bg-white border border-gray-200 rounded p-2 space-y-1 text-xs font-mono">
      ${keys.map(function (k) {
        const routes = t[k] || [];
        return html`
          <div key=${k} className="flex items-center gap-2">
            <span className="text-gray-600">paymentStatus=${k}</span>
            <span className="text-gray-400">→</span>
            <span className="text-gray-800">[${routes.join(", ") || "（空 = 任何 chosenRoute 都不在名单）"}]</span>
          </div>
        `;
      })}
    </div>
  `;
}

export function EdgeTableCheckPanel(props) {
  const r = props.result;
  return html`
    <section className="border-2 rounded p-4 space-y-3 border-emerald-300 bg-emerald-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-emerald-900">右栏 · 手写边表核对</h2>
        <span className="text-xs px-2 py-1 rounded border font-semibold bg-emerald-100 text-emerald-800 border-emerald-300">
          declared 边表说了算
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/edge-table-check，体 = {"{ intent, paymentStatus }"}；服务端跑 <code>runEdgeTableCheck</code> —— 同一段选边后按 declared edgeTable 核对，不在名单 = 拒绝非法转移。
      </div>

      ${r ? html`
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">选出来的下一站（chosenRoute）</div>
            <div className="text-base">${r.chosenRoute}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">边表核对后的下一站（nextNode）</div>
            <div className=${"text-base " + (r.allowed ? "text-emerald-700" : "text-red-700")}>${r.nextNode}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2 col-span-2">
            <div className="font-semibold text-gray-700">放行 / 拒绝</div>
            <div className=${"text-base " + (r.allowed ? "text-emerald-700" : "text-red-700")}>${r.allowed ? "✅ 放行（在 declared 边表里）" : "❌ 拒绝（不在 declared 边表里 = 非法转移）"}</div>
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

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">declared 边表（你仓库里 declared 的字段）</div>
        ${r ? html`<${EdgeTableView} edgeTable=${r.edgeTable} />` : html`<${EdgeTableView} edgeTable=${{}} />`}
      </div>

      <div className="border-2 border-dashed border-red-300 bg-red-50 rounded p-2 text-xs text-red-800">
        拦截按你 declared 的边表说了算 —— 不在名单 = 拒绝非法转移。「产品会不会拦」不能脑补，要看你这条边有没有 declared。
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="bg-black text-white px-4 py-2 rounded disabled:opacity-50" disabled=${props.busy} onClick=${props.onSubmit}>
          跑（POST /api/edge-table-check）
        </button>
        <button className="border border-gray-300 px-4 py-2 rounded disabled:opacity-50" disabled=${props.busy} onClick=${props.onReset}>
          清空这一栏
        </button>
      </div>

      ${props.errorText ? html`<div className="border border-red-300 bg-red-50 text-red-800 text-sm rounded p-2">${props.errorText}</div>` : null}
    </section>
  `;
}