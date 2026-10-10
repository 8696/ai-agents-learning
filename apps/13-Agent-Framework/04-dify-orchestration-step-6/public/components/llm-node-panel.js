/**
 * 职责：左栏「单独一个大模型节点」面板 —— 展示单次 LLM 调用的结果（rounds=1, toolTrace=[]）。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 *
 * 教学点：单次大模型节点 ≠ Agent 循环 —— 模型拿到用户原话就返回 finalReply，**不会**自己调工具查库存。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

export function LLMNodePanel(props) {
  const r = props.result;
  return html`
    <section className="border-2 rounded p-4 space-y-3 border-yellow-300 bg-yellow-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-yellow-900">左栏 · 单独一个大模型节点</h2>
        <span className="text-xs px-2 py-1 rounded border font-semibold bg-yellow-100 text-yellow-800 border-yellow-300">
          只调一次 · 不传 tools
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/llm-node，体 = {"{ text, maxRounds: 4 }"}；服务端跑 <code>runSingleLLMNode</code> —— 调一次 LLM（不传 tools），返回 finalReply + toolTrace=[]。
      </div>

      ${r ? html`
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">跑了多少圈（rounds）</div>
            <div className="text-lg text-yellow-700">${r.rounds}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">调了几个工具（toolTrace.length）</div>
            <div className="text-lg text-yellow-700">${r.toolTrace.length}</div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded p-2">
          <div className="text-xs font-semibold text-gray-700 mb-1">给用户的最终一句（finalReply）</div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap">${r.finalReply}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded p-2 text-xs">
          <div className="font-semibold text-gray-700">是否传了 tools</div>
          <div className="text-gray-700">${r.passedTools ? "✅ 传了" : "❌ 没传"}</div>
        </div>
      ` : html`<div className="text-xs text-gray-500 italic">（点按钮跑完才有结果）</div>`}

      <div className="border-2 border-dashed border-yellow-400 bg-yellow-100 rounded p-2 text-xs text-yellow-900">
        单次大模型节点 ≠ Agent 循环 —— finalReply 是模型凭印象给的（没查库存）。
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="bg-yellow-600 text-white px-4 py-2 rounded disabled:opacity-50" disabled={props.busy} onClick={props.onSubmit}>
          跑（POST /api/llm-node）
        </button>
        <button className="border border-gray-300 px-4 py-2 rounded disabled:opacity-50" disabled={props.busy} onClick={props.onReset}>
          清空这一栏
        </button>
      </div>

      ${props.errorText ? html`<div className="border border-red-300 bg-red-50 text-red-800 text-sm rounded p-2">${props.errorText}</div>` : null}
    </section>
  `;
}