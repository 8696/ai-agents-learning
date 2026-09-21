/**
 * 职责：顶部跨页导航。step-3 内部页面（向量化 · 嵌入模型）。
 * 数据流：props.current 高亮；props.base 拼 href。
 *
 * 加载方式：本文件用 HTM 写（`html\`...\`` 是 tagged template literal），
 *   浏览器原生执行，不需要 Babel 转译。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const PAGES = [
  { key: "embed", label: "向量化（embed / embedMany / 余弦检索）", href: "index.html" },
];

const NAV_CLASS_ACTIVE = "px-3 py-1 rounded border border-blue-500 bg-blue-50 text-blue-700 font-semibold";
const NAV_CLASS_IDLE = "px-3 py-1 rounded border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100";

export function PageNav(props) {
  return html`
    <nav className="bg-white border border-gray-200 rounded p-3 flex flex-wrap gap-2 text-sm">
      ${PAGES.map(function (item) {
        const active = item.key === props.current;
        return html`
          <a
            key=${item.key}
            href=${(props.base || "") + item.href}
            className=${active ? NAV_CLASS_ACTIVE : NAV_CLASS_IDLE}
          >${item.label}</a>
        `;
      })}
    </nav>
  `;
}