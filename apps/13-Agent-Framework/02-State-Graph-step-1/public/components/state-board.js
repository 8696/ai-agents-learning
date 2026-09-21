/**
 * 职责：把这一单的四格状态画成「订单夹」。变绿的格子 = 这一站新写的；灰格 = 原样带着。
 * 数据流：props.state + props.changedKeys（补丁里的字段名）。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const FIELDS = [
  { key: "drinkName", zh: "客人口述", who: "进门时就有，三站都不改它" },
  { key: "orderSlip", zh: "订单条", who: "点单站写" },
  { key: "cupLabel", zh: "杯盖", who: "热饮站写" },
  { key: "pickupCall", zh: "取餐广播", who: "出餐站写" },
];

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "空";
  return String(value);
}

export function StateBoard(props) {
  const state = props.state || {};
  const changed = props.changedKeys || [];
  return html`
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-700">${props.title || "这一单的四格（状态 State）"}</div>
      <p className="text-xs text-gray-600">${props.hint || ""}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        ${FIELDS.map(function (field) {
          const isEmpty = state[field.key] === null || state[field.key] === undefined || state[field.key] === "";
          const isChanged = changed.indexOf(field.key) !== -1;
          const box = isChanged
            ? "border-green-300 bg-green-50"
            : "border-gray-300 bg-gray-50";
          let badge = "还是空的";
          if (isChanged) badge = "这一站新写的";
          else if (!isEmpty) badge = "原样带着";
          const badgeCls = isChanged
            ? "bg-green-100 text-green-900"
            : "bg-gray-200 text-gray-700";
          return html`
            <div key=${field.key} className=${"border rounded p-2 space-y-1 " + box}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-gray-900">
                  ${field.zh}
                  <span className="ml-1 font-mono text-gray-600">${field.key}</span>
                </div>
                <span className=${"text-xs px-2 py-0.5 rounded " + badgeCls}>${badge}</span>
              </div>
              <div className="text-xs text-gray-600">${field.who}</div>
              <pre className="whitespace-pre-wrap text-xs bg-white text-gray-700 p-2 rounded max-h-24 overflow-auto">${displayValue(state[field.key])}</pre>
            </div>
          `;
        })}
      </div>
    </div>
  `;
}
