/**
 * 职责：右栏「有次数变量」面板 —— 展示「画了回边 + 自己写次数变量」的转圈轨迹。
 * 数据流：吃 props.result（含 turns / rounds / stoppedReason / counterValue / counterLimit），回返渲染。纯展示。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 *
 * 教学点：次数变量归你自己写 —— 到上限退。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const STOPPED_TEXT = {
  natural: { cls: "text-green-700", text: "自然收尾（库存到了）" },
  maxRounds: { cls: "text-red-700", text: "闸门触发（maxRounds 强行停）" },
  counterLimit: { cls: "text-green-700", text: "次数变量退出（counterLimit 触发）" },
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
        const actionCls = isPull ? "border-green-300 bg-green-50" : "border-yellow-300 bg-yellow-50";
        const counterText = isPull ? " · 次数变量 →" + t.counterValue : "";
        return html`
          <li key=${i} className=${"border rounded p-2 text-xs space-y-1 " + actionCls}>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-semibold bg-gray-200 text-gray-700">第 ${t.round} 圈</span>
              <span className="font-semibold">${t.action}</span>
              <span className="text-gray-400 ml-auto">${isPull ? "← 回边拉回 + 次数 + 1" : "← 查库存"}</span>
            </div>
            <div className="text-gray-700">结果：${t.result}${counterText}</div>
          </li>
        `;
      })}
    </ol>
  `;
}

export function LoopEdgeWithCounterPanel(props) {
  const result = props.result;
  const stopped = result ? (STOPPED_TEXT[result.stoppedReason] || { cls: "text-gray-700", text: result.stoppedReason }) : null;
  const counter = result && typeof result.counterValue === "number" ? result.counterValue : null;
  const limit = result && typeof result.counterLimit === "number" ? result.counterLimit : null;
  return html`
    <section className="border-2 rounded p-4 space-y-3 border-green-300 bg-green-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-green-900">右栏 · 有次数变量（自己写了闸门）</h2>
        <span className="text-xs px-2 py-1 rounded border font-semibold bg-green-100 text-green-800 border-green-300">
          闸门归你
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/loop-edge-with-counter，体 = {"{ inStock: false, maxRounds: 6, counterLimit: 3 }"}；服务端跑 <code>runWithCounter</code>，每拉回一次 counter 变量 + 1，counter ≥ counterLimit（默认 3）就退。
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">画布上的回边 + 次数变量（counterLimit 默认 3）</div>
        <pre className="bg-gray-50 border border-gray-300 rounded p-3 font-mono text-xs whitespace-pre overflow-x-auto">查库存 → 拉回问客人 (counter=1) → 查库存 → 拉回问客人 (counter=2) → 查库存 → 拉回问客人 (counter=3) → 退出</pre>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-white border border-gray-200 rounded p-2">
          <div className="font-semibold text-gray-700">跑了多少圈</div>
          <div className="text-lg text-green-700">${result ? result.rounds : "—"}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded p-2">
          <div className="font-semibold text-gray-700">次数变量（counterValue）</div>
          <div className="text-lg text-green-700">${counter === null ? "—" : counter}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded p-2">
          <div className="font-semibold text-gray-700">上限（counterLimit）</div>
          <div className="text-lg text-green-700">${limit === null ? "—" : limit}</div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">轨迹（turns · 每拉回 counter + 1）</div>
        ${result ? html`<${TurnsList} turns=${result.turns} />` : html`<${TurnsList} turns=${[]} />`}
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">终止原因</div>
        <div className=${"text-sm " + (stopped ? stopped.cls : "text-gray-400")}>${stopped ? stopped.text : "—"}</div>
      </div>

      <div className="border-2 border-dashed border-green-400 bg-green-100 rounded p-2 text-xs text-green-900">
        自己写了一个 counter 变量 → 拉回一次 + 1，到 counterLimit（默认 3）就退。这正是模块 07 的 maxIterations 闸门 = 你仓库里 declared 的字段，不归产品。
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled=${props.busy}
          onClick=${props.onSubmit}
        >
          跑（POST /api/loop-edge-with-counter）
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