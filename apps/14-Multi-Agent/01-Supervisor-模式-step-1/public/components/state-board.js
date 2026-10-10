/**
 * 职责：共享状态板 —— 把当前 SharedState 的字段逐项显示（哪个字段空 = 哪个工人还没派）。
 * 数据流：吃 props.state + props.title；逐行渲染（字段名 + 当前值 + 空态灰字）。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const FIELD_DEFS = [
  { key: "orderSlip", label: "客人原话（orderSlip）", mutable: false },
  { key: "menuNotes", label: "菜单结论（menuNotes）", mutable: true },
  { key: "drinkType", label: "冷热（drinkType）", mutable: true },
  { key: "cupLabel", label: "杯贴（cupLabel）", mutable: true },
  { key: "pickupCall", label: "叫号（pickupCall）", mutable: true },
  { key: "guestReply", label: "最终答复（guestReply）", mutable: true },
];

function renderValue(value) {
  if (value === null || value === undefined || value === "") return "（还没填）";
  return String(value);
}

export function StateBoard(props) {
  const state = props.state || {};
  return html`
    <section className="bg-white shadow rounded p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">${props.title || "共享状态（Shared State）"}</h2>
        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
          round ${state.round ?? 0}
        </span>
      </div>
      <div className="text-xs text-gray-500">
        同一份字段共享给店长和工人。下一站看见什么字段 = 上一站交还了什么。
      </div>
      <ul className="space-y-1">
        ${FIELD_DEFS.map(function (def) {
          const value = state[def.key];
          const isEmpty = value === null || value === undefined || value === "";
          return html`
            <li
              key=${def.key}
              className=${"flex items-baseline gap-3 text-sm " + (isEmpty ? "text-gray-400" : "text-gray-800")}
            >
              <span className="font-mono text-xs w-32 shrink-0">${def.label}</span>
              <span className=${"flex-1 " + (isEmpty ? "italic" : "")}>
                ${renderValue(value)}
              </span>
            </li>
          `;
        })}
      </ul>
    </section>
  `;
}
