/**
 * 职责：中栏「智能体应用」面板 —— 调的是同一个 while + 调大模型，但 messages 数组不返前端；只露「产品在背后转了几圈 + 最后一句」。
 * 数据流：吃 props.text + props.busy + props.onSubmit，回返 { roundsHidden, finalReply, toolTrace }。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 *
 * 教学点：messages 数组在 API 返回里**不存在**——前端用虚线 + 灰显格表达「消息列表归产品，不归你」；
 * 服务端日志里仍然有完整 messages（可去 logs/ 看）。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

function ToolTraceView(props) {
  const trace = props.toolTrace || [];
  if (trace.length === 0) {
    return html`<div className="text-xs text-gray-500 italic">（这一轮没调工具）</div>`;
  }
  return html`
    <ul className="space-y-1">
      ${trace.map(function (t, i) {
        return html`
          <li key=${i} className="border border-amber-300 bg-amber-50 rounded p-2 text-xs">
            <div className="font-semibold text-amber-900">${t.name}(${Object.keys(t.args).join(", ")})</div>
            <div className="text-gray-700 whitespace-pre-wrap">返回：${JSON.stringify(t.result)}</div>
          </li>
        `;
      })}
    </ul>
  `;
}

export function AgentAppPanel(props) {
  const result = props.result;
  return html`
    <section className="border-2 rounded p-4 space-y-3 border-purple-300 bg-purple-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-purple-900">中栏 · 智能体应用（编排产品）</h2>
        <span className="text-xs px-2 py-1 rounded border font-semibold bg-purple-100 text-purple-800 border-purple-300">
          循环藏在产品里
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/agent-app，体 = {"{ text, maxRounds: 4 }"}；服务端跑**同一个 while**，但只返 {"{ roundsHidden, finalReply, toolTrace }"}（messages 数组不返）。
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">
          消息列表（messages · 归产品）
        </div>
        <div className="border-2 border-dashed border-gray-400 bg-gray-100 rounded p-3 text-xs text-gray-500 italic">
          （灰显格）这一格是产品在背后追加的 messages 数组 —— 你看不到。点上面的「跑智能体应用」，服务端**真的**会调大模型（同一个 while），完整 messages 留在 logs/ 里。
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white border border-gray-200 rounded p-2">
          <div className="font-semibold text-gray-700">产品内部转了几圈（roundsHidden）</div>
          <div className="text-lg text-purple-700">${result ? result.roundsHidden : "—"}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded p-2">
          <div className="font-semibold text-gray-700">终止原因（stoppedReason）</div>
          <div className="text-lg ${result ? (result.stoppedReason === "natural" ? "text-green-700" : "text-amber-700") : "text-gray-400"}">${result ? result.stoppedReason : "—"}</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded p-2">
        <div className="text-xs font-semibold text-gray-700 mb-1">
          给用户的那一句（finalReply）—— 这是产品「推门递出来」的那一句
        </div>
        <div className="text-sm text-gray-800 whitespace-pre-wrap">${result ? result.finalReply : "（还没跑）"}</div>
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">工具轨迹（toolTrace · 不在 messages 里，独立字段）</div>
        ${result ? html`<${ToolTraceView} toolTrace=${result.toolTrace} />` : html`<${ToolTraceView} toolTrace=${[]} />`}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="bg-purple-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled=${props.busy}
          onClick=${props.onSubmit}
        >
          跑智能体应用（POST /api/agent-app）
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