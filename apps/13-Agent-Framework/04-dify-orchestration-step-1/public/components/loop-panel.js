/**
 * 职责：左栏「手写循环」面板 —— 跑 while + 调大模型 + 调工具（mock），把完整 messages 数组 + 圈数 + finalReply 摊给前端看。
 * 数据流：吃 props.text + props.busy + props.onSubmit（提交时回调），回返 { messages, rounds, finalReply, toolTrace }。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

function bubbleStyle(role) {
  if (role === "system") return "border-blue-300 bg-blue-50";
  if (role === "user") return "border-gray-300 bg-gray-50";
  if (role === "tool") return "border-amber-300 bg-amber-50";
  return "border-green-300 bg-green-50";
}

function renderContent(content) {
  if (content == null) return "（空）";
  if (typeof content === "string") return content;
  return JSON.stringify(content);
}

function MessageListView(props) {
  const messages = props.messages || [];
  if (messages.length === 0) {
    return html`<div className="text-xs text-gray-500 italic">还没有消息。先点「跑手写循环」。</div>`;
  }
  return html`
    <ul className="space-y-2">
      ${messages.map(function (msg, i) {
        const toolCalls = msg.tool_calls;
        const toolCallSummary = toolCalls && toolCalls.length > 0
          ? ` · 工具调用：${toolCalls.map(function (tc) { return tc.name; }).join(", ")}`
          : "";
        return html`
          <li
            key=${i}
            className=${"border rounded p-2 space-y-1 " + bubbleStyle(msg.role)}
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded font-semibold bg-gray-200 text-gray-700">${msg.role}</span>
              ${toolCallSummary ? html`<span className="text-gray-600">${toolCallSummary}</span>` : null}
              <span className="text-gray-400 ml-auto">#${i + 1}</span>
            </div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap">${renderContent(msg.content)}</div>
          </li>
        `;
      })}
    </ul>
  `;
}

export function LoopPanel(props) {
  const result = props.result;
  return html`
    <section className="border-2 rounded p-4 space-y-3 border-green-300 bg-green-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-green-900">左栏 · 手写循环（对照模块 07）</h2>
        <span className="text-xs px-2 py-1 rounded border font-semibold bg-green-100 text-green-800 border-green-300">
          while 在仓库里
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/handwritten-loop，体 = {"{ text, maxRounds: 4 }"}；服务端跑 runLoop({exposeMessages:true}) → 返回完整 messages + 圈数 + 工具轨迹。
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">消息列表（你拥有这段 messages）</div>
        ${result ? html`<${MessageListView} messages=${result.messages} />` : html`<${MessageListView} messages=${[]} />`}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white border border-gray-200 rounded p-2">
          <div className="font-semibold text-gray-700">跑了多少圈（rounds）</div>
          <div className="text-lg text-green-700">${result ? result.rounds : "—"}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded p-2">
          <div className="font-semibold text-gray-700">终止原因（stoppedReason）</div>
          <div className="text-lg ${result ? (result.stoppedReason === "natural" ? "text-green-700" : "text-amber-700") : "text-gray-400"}">${result ? result.stoppedReason : "—"}</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded p-2">
        <div className="text-xs font-semibold text-gray-700 mb-1">给用户的最终一句（finalReply）</div>
        <div className="text-sm text-gray-800 whitespace-pre-wrap">${result ? result.finalReply : "（还没跑）"}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled=${props.busy}
          onClick=${props.onSubmit}
        >
          跑手写循环（POST /api/handwritten-loop）
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