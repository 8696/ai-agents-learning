/**
 * 职责：把一段源代码和「这一步是为了做什么」摊开。声明步骤、运行时每一站都用它。
 * 数据流：props.title / why / code → 黄底说明 + 灰底 pre。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

export function SourceBlock(props) {
  return html`
    <div className="border border-gray-200 rounded p-3 space-y-2 bg-white">
      <div className="text-sm font-semibold text-gray-900">${props.title}</div>
      <p className="text-xs text-gray-700">${props.why}</p>
      <pre className="whitespace-pre-wrap text-xs bg-gray-50 text-gray-700 p-2 rounded max-h-56 overflow-auto">${props.code || "（没有源代码）"}</pre>
    </div>
  `;
}
