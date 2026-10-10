/**
 * 职责：左栏「无次数变量」面板 —— 展示「画了回边但没写次数变量」的转圈轨迹。
 * 数据流：吃 props.result（含 turns / rounds / stoppedReason），回返渲染。纯展示，不持有状态。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 *
 * 教学点：画了圈不代表不让你手作圈 —— 没写次数变量就一直转。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const STOPPED_TEXT = {
  natural: { cls: "text-green-700", text: "自然收尾（库存到了）" },
  maxRounds: { cls: "text-red-700", text: "闸门触发（一直转，到 maxRounds 强行停）" },
  counterLimit: { cls: "text-green-700", text: "次数变量退出" },
};

function TurnsList(props) {
  const turns = props.turns || [];
  if (turns.length === 0) {
    return html`<div className="text-xs text-gray-500 italic">（轨迹还没出）</div>`;
  }
  return html`
    <ol className="space-y-1">
      ${turns.map(function (t, i) {
        const isPull = t.action === "拉回问客人";
        const actionCls = isPull ? "border-red-300 bg-red-50" : "border-yellow-300 bg-yellow-50";
        return html`
          <li key=${i} className=${"border rounded p-2 text-xs space-y-1 " + actionCls}>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-semibold bg-gray-200 text-gray-700">第 ${t.round} 圈</span>
              <span className="font-semibold">${t.action}</span>
              <span className="text-gray-400 ml-auto">${isPull ? "← 回边拉回这一站" : "← 查库存"}</span>
            </div>
            <div className="text-gray-700">结果：${t.result}</div>
          </li>
        `;
      })}
    </ol>
  `;
}

export function LoopEdgeWithoutCounterPanel(props) {
  const result = props.result;
  const stopped = result ? (STOPPED_TEXT[result.stoppedReason] || { cls: "text-gray-700", text: result.stoppedReason }) : null;
  return html`
    <section className="border-2 rounded p-4 space-y-3 border-red-300 bg-red-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-red-900">左栏 · 无次数变量（圈画了但没闸门）</h2>
        <span className="text-xs px-2 py-1 rounded border font-semibold bg-red-100 text-red-800 border-red-300">
          没自己写闸门
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/loop-edge-without-counter，体 = {"{ inStock: false, maxRounds: 6 }"}；服务端跑 <code>runWithoutCounter</code>，**没有** counter 变量 → 库存一直缺 → 一圈一圈拉回 → 闸门触发。
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">画布上的回边（形状你画了，执行归产品）</div>
        <pre className="bg-gray-50 border border-gray-300 rounded p-3 font-mono text-xs whitespace-pre overflow-x-auto">查库存 → 拉回问客人 → 查库存 → 拉回问客人 → ...（圈一直拉）</pre>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white border border-gray-200 rounded p-2">
          <div className="font-semibold text-gray-700">跑了多少圈（rounds）</div>
          <div className="text-lg text-red-700">${result ? result.rounds : "—"}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded p-2">
          <div className="font-semibold text-gray-700">终止原因（stoppedReason）</div>
          <div className=${"text-lg " + (stopped ? stopped.cls : "text-gray-400")}>${stopped ? stopped.text : "—"}</div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">轨迹（turns）</div>
        ${result ? html`<${TurnsList} turns=${result.turns} />` : html`<${TurnsList} turns=${[]} />`}
      </div>

      <div className="border-2 border-dashed border-red-400 bg-red-100 rounded p-2 text-xs text-red-900">
        没写次数变量 = 没自己写的 maxIterations 闸门 —— 库存永远缺就一直转，直到路由里的 maxRounds 强行停。
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled=${props.busy}
          onClick=${props.onSubmit}
        >
          跑（POST /api/loop-edge-without-counter）
        </button>
        <button
          className="border border-gray-300 px-4 py-2 rounded disabled:opacity-50"
          disabled=${props.busy}
          onClick=${props.onReset}
        >
          清空这一栏
        </button>
      </div>

      ${props.errorText ? html`
        <div className="border border-red-300 bg-red-50 text-red-800 text-sm rounded p-2">
          ${props.errorText}
        </div>
      ` : null}
    </section>
  `;
}