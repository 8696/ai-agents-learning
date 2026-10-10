/**
 * 职责：顶部跨页导航（单页 demo · 当前 = 首页）。
 * 数据流：props.current 高亮；props.base 拼 href——根目录页传 ""。
 *
 * 加载方式：本文件用 HTM 写（`html\`...\`` 是 tagged template literal），
 *          浏览器原生执行，不需要 Babel 转译；
 *          业务代码里直接 `import { PageNav } from "/components/page-nav.js"` 即可。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const NAV_CLASS_ACTIVE =
  "px-3 py-1 rounded border border-blue-500 bg-blue-50 text-blue-700 font-semibold";
const NAV_CLASS_IDLE =
  "px-3 py-1 rounded border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100";

const PAGES = [
  { key: "main", label: "Dify 等编排产品 · 第四步 · 条件分支 vs 边表核对", href: "index.html" },
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
        step-1~3 在端口 50154 / 50155 / 50156（yarn app:13-04-dify-orchestration-step-1/2/3）
      </span>
    </nav>
  `;
}