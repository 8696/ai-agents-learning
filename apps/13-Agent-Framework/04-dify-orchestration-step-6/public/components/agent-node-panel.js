/**
 * 职责：右栏「智能体节点」面板 —— 展示智能体节点的结果（rounds ≥ 1, toolTrace ≠ []）。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 *
 * 教学点：智能体节点 = "把 while + 调工具塞进一个方块" —— 模型自己决定要不要调，调几次。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

function ToolTraceView(props) {
  const trace = props.toolTrace || [];
  if (trace.length === 0) {
    return html`<div className="text-xs text-gray-500 italic">（这一栏没调工具）</div>`;
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

export function AgentNodePanel(props) {
  const r = props.result;
  return html`
    <section className="border-2 rounded p-4 space-y-3 border-green-300 bg-green-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-green-900">右栏 · 智能体节点</h2>
        <span className="text-xs px-2 py-1 rounded border font-semibold bg-green-100 text-green-800 border-green-300">
          带 tools · 自己调几次
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/agent-node，体 = {"{ text, maxRounds: 4 }"}；服务端跑 <code>runSmartAgentNode</code> —— while：调 LLM（带 tools）→ 调 check_inventory → 再调 LLM → finalReply。
      </div>

      ${r ? html`
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">跑了多少圈（rounds）</div>
            <div className="text-lg text-green-700">${r.rounds}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">调了几个工具（toolTrace.length）</div>
            <div className="text-lg text-green-700">${r.toolTrace.length}</div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded p-2">
          <div className="text-xs font-semibold text-gray-700 mb-1">给用户的最终一句（finalReply）</div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap">${r.finalReply}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-1">工具轨迹（toolTrace）</div>
          <${ToolTraceView} toolTrace=${r.toolTrace} />
        </div>
        <div className="bg-white border border-gray-200 rounded p-2 text-xs">
          <div className="font-semibold text-gray-700">是否传了 tools</div>
          <div className="text-gray-700">${r.passedTools ? "✅ 传了" : "❌ 没传"}</div>
        </div>
      ` : html`<div className="text-xs text-gray-500 italic">（点按钮跑完才有结果）</div>`}

      <div className="border-2 border-dashed border-green-400 bg-green-100 rounded p-2 text-xs text-green-900">
        智能体节点 = 把模块 07 的 while + 调工具塞进一个方块 —— 模型自己决定要不要调，调几次。
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50" disabled={props.busy} onClick={props.onSubmit}>
          跑（POST /api/agent-node）
        </button>
        <button className="border border-gray-300 px-4 py-2 rounded disabled:opacity-50" disabled={props.busy} onClick={props.onReset}>
          清空这一栏
        </button>
      </div>

      ${props.errorText ? html`<div className="border border-red-300 bg-red-50 text-red-800 text-sm rounded p-2">${props.errorText}</div>` : null}
    </section>
  `;
}