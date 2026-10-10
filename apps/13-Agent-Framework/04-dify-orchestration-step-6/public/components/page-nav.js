/**
 * 职责：顶部跨页导航（单页 demo · 当前 = 首页）。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const NAV_CLASS_ACTIVE =
  "px-3 py-1 rounded border border-blue-500 bg-blue-50 text-blue-700 font-semibold";
const NAV_CLASS_IDLE =
  "px-3 py-1 rounded border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100";

const PAGES = [
  { key: "main", label: "Dify 等编排产品 · 第六步 · 单次 vs 智能体节点", href: "index.html" },
];

export function PageNav(props) {
  const current = props.current;
  const base = props.base || "";
  return html`
    <nav className="bg-white border border-gray-200 rounded p-3 flex flex-wrap gap-2 text-sm">
      ${PAGES.map(function (item) {
        const active = item.key === current;
        return html`
          <a key=${item.key} href=${base + item.href} className=${active ? NAV_CLASS_ACTIVE : NAV_CLASS_IDLE}>${item.label}</a>
        `;
      })}
      <span className="px-3 py-1 rounded text-gray-500 text-xs">
        step-1~5 在端口 50154 ~ 50158（yarn app:13-04-dify-orchestration-step-1 ~ step-5）
      </span>
    </nav>
  `;
}