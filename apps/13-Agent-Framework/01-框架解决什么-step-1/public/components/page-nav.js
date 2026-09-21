/**
 * 职责：顶部跨页导航。手写循环首页 / 框架循环子页 / 试用 useChat 子页 / 仓库里没有 loop.ts 子页。
 * 数据流：props.current 高亮；props.base 拼 href。
 *
 * 加载方式：本文件没有 JSX，全部用 React.createElement，
 *          因此是「直接可被浏览器当 ESM 解析」的合法模块。
 *          业务代码里直接 `import { PageNav } from ".../page-nav.js"` 即可。
 */
import React from "react";

const PAGES = [
  { key: "overview", label: "手写循环（Agent Loop）", href: "index.html" },
  { key: "framework", label: "框架循环（Framework Loop）", href: "pages/framework.html" },
  { key: "use-chat", label: "试用 useChat（JSX）", href: "pages/use-chat.html" },
  { key: "no-loop", label: "仓库里没有 loop.ts", href: "pages/no-loop.html" },
];

const NAV_CLASS_ACTIVE = "px-3 py-1 rounded border border-blue-500 bg-blue-50 text-blue-700 font-semibold";
const NAV_CLASS_IDLE = "px-3 py-1 rounded border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100";

export function PageNav(props) {
  const current = props.current;
  const base = props.base || "";
  return React.createElement(
    "nav",
    { className: "bg-white border border-gray-200 rounded p-3 flex flex-wrap gap-2 text-sm" },
    PAGES.map(function (item) {
      const active = item.key === current;
      return React.createElement(
        "a",
        {
          key: item.key,
          href: base + item.href,
          className: active ? NAV_CLASS_ACTIVE : NAV_CLASS_IDLE,
        },
        item.label
      );
    })
  );
}