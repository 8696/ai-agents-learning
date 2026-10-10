/**
 * 职责：知识库节点 vs Agent 循环节点 的共享面板组件。
 * 通过 props.title + props.hasLoop + props.side 区分左右栏。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

function TurnsList(props) {
  const turns = props.turns || [];
  if (turns.length === 0) {
    return html`<div className="text-xs text-gray-500 italic">（还没跑）</div>`;
  }
  return html`
    <ol className="space-y-1">
      ${turns.map(function (t) {
        const isKB = t.action === "调知识库";
        const cls = isKB ? "border-yellow-300 bg-yellow-50" : "border-green-300 bg-green-50";
        return html`
          <li key=${t.round} className=${"border rounded p-2 text-xs space-y-1 " + cls}>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-semibold bg-gray-200 text-gray-700">第 ${t.round} 圈</span>
              <span className="font-semibold">${t.action}</span>
            </div>
            <div className="text-gray-700">结果：${t.result}</div>
          </li>
        `;
      })}
    </ol>
  `;
}

export function KBPanel(props) {
  const r = props.result;
  const hasLoop = r && r.hasLoop;
  return html`
    <section className=${"border-2 rounded p-4 space-y-3 " + (hasLoop ? "border-green-300 bg-green-50" : "border-yellow-300 bg-yellow-50")}>
      <div className="flex items-center justify-between">
        <h2 className=${"text-sm font-semibold " + (hasLoop ? "text-green-900" : "text-yellow-900")}>${props.title}</h2>
        <span className=${"text-xs px-2 py-1 rounded border font-semibold " + (hasLoop ? "bg-green-100 text-green-800 border-green-300" : "bg-yellow-100 text-yellow-800 border-yellow-300")}>
          ${hasLoop ? "while + KB + LLM 汇总" : "调一次 KB 就停"}
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST <code>${props.endpoint}</code>，体 = {"{ query }"}；服务端跑 <code>${props.flowFunc}</code> —— ${hasLoop ? "while 循环：调 KB → 模型看 KB → 再调 KB → 调 LLM 汇总" : "调一次 mock KB 检索 → 拿到 top-1 → 输出"}。
      </div>

      ${r ? html`
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">跑了多少圈（rounds）</div>
            <div className=${"text-lg " + (hasLoop ? "text-green-700" : "text-yellow-700")}>${r.rounds}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">带循环（hasLoop）</div>
            <div className=${"text-base " + (r.hasLoop ? "text-green-700" : "text-yellow-700")}>${r.hasLoop ? "✅ 是" : "❌ 否"}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">终止原因（stoppedReason）</div>
            <div className=${"text-base " + (r.stoppedReason === "natural" ? "text-emerald-700" : "text-amber-700")}>${r.stoppedReason === "natural" ? "natural" : "maxRounds"}</div>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-1">流程轨迹（turns）</div>
          <${TurnsList} turns=${r.turns} />
        </div>
        <div className="bg-white border border-gray-200 rounded p-2">
          <div className="text-xs font-semibold text-gray-700 mb-1">给用户的最终一句（finalReply）</div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap">${r.finalReply}</div>
        </div>
      ` : html`<div className="text-xs text-gray-500 italic">（点按钮跑完才有结果）</div>`}

      <div className=${"border-2 border-dashed rounded p-2 text-xs " + (hasLoop ? "border-green-400 bg-green-100 text-green-900" : "border-yellow-400 bg-yellow-100 text-yellow-900")}>
        ${hasLoop ? "Agent 循环节点 = 把 while + 调工具塞进一个方块 —— 模型自己决定要不要调。" : "知识库节点 = 检索那一跳 —— 调一次就停，停了不会自己再调一次。"}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className=${hasLoop ? "bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50" : "bg-yellow-600 text-white px-4 py-2 rounded disabled:opacity-50"} disabled={props.busy} onClick={props.onSubmit}>
          跑（POST ${props.endpoint}）
        </button>
        <button className="border border-gray-300 px-4 py-2 rounded disabled:opacity-50" disabled={props.busy} onClick={props.onReset}>
          清空这一栏
        </button>
      </div>

      ${props.errorText ? html`<div className="border border-red-300 bg-red-50 text-red-800 text-sm rounded p-2">${props.errorText}</div>` : null}
    </section>
  `;
}