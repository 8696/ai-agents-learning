/**
 * 职责：把固定场景 + 两栏（单 tool_call vs 多 tool_call 并行）判据 / 入口代码摊在页面上。
 * 数据流：吃 props.scenario（来自 GET /api/scenario），按字段渲染。纯展示，不持有状态。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

function SourceBlock(props) {
  return html`
    <pre className="bg-gray-900 text-gray-100 text-xs rounded p-3 overflow-x-auto whitespace-pre">
${props.code}
    </pre>
  `;
}

export function ScenarioBoard(props) {
  const s = props.scenario;
  if (!s) {
    return html`<div className="text-xs text-gray-500">加载场景中…</div>`;
  }
  return html`
    <section className="bg-white shadow rounded p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">固定场景 · 订单 ${s.orderId} · 「有没有货 / 几天到」</h2>
      <div className="text-sm text-gray-700 bg-gray-50 border border-gray-300 rounded p-2">
        <span className="text-xs text-gray-500">用户原话：</span>${s.userMessage}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-green-300 bg-green-50 rounded p-3 space-y-2">
          <div className="text-sm font-semibold text-green-900">左栏 · 当工具调用（单 tool_call · mode: tool）</div>
          <div className="text-xs text-gray-700">下一句判据：${s.rationaleTool}</div>
          <div className="text-xs font-semibold text-gray-700">入口代码</div>
          <${SourceBlock} code=${s.toolSource} />
        </div>

        <div className="border border-orange-300 bg-orange-50 rounded p-3 space-y-2">
          <div className="text-sm font-semibold text-orange-900">右栏 · 当工具调用（同一轮多 tool_call 并行 · mode: tool-multi）</div>
          <div className="text-xs text-gray-700">下一句判据：${s.rationaleToolMulti}</div>
          <div className="text-xs font-semibold text-gray-700">入口代码</div>
          <${SourceBlock} code=${s.toolMultiSource} />
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700">两边共同的判据</div>
        <${SourceBlock} code=${s.commonSource} />
      </div>
    </section>
  `;
}