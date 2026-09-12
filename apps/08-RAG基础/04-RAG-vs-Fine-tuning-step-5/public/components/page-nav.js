// 职责：跨 sub-page 的顶部导航 tab，挂在 window.DemoUI.PageNav。
// 当前页面用 `<PageNav current="..." />` 即可拿到 8 个变体的入口 + 标高亮当前。
// 数据流：硬编码 8 个变体的标题 + 路径（不调 API）；高亮由 current prop 决定。
const { useState, useEffect } = React;

const NAV_ITEMS = [
  { id: "style-vs-structured",    path: "/pages/style-vs-structured.html",    title: "需求 3  · 风格稳" },
  { id: "privacy-irreversible",   path: "/pages/privacy-irreversible.html",   title: "需求 11 · 隐私" },
  { id: "capability-boundary",    path: "/pages/capability-boundary.html",    title: "需求 12 · 能力边界" },
  { id: "fewshot-vs-finetune",    path: "/pages/fewshot-vs-finetune.html",    title: "需求 13 · 检索范例 ≠ 微调" },
  { id: "cost-card",              path: "/pages/cost-card.html",              title: "变体 9  · 成本对照" },
  { id: "human-in-the-loop",      path: "/pages/human-in-the-loop.html",      title: "需求 14 · 人在回路" },
];

function PageNav({ current }) {
  return (
    <nav className="border-b bg-white px-4 py-2 text-xs">
      <div className="container mx-auto flex flex-wrap items-center gap-2">
        <a href="/" className="font-semibold text-gray-700 mr-2">
          ← step-5 总览
        </a>
        {NAV_ITEMS.map((it) => {
          const active = it.id === current;
          return (
            <a
              key={it.id}
              href={it.path}
              className={
                "px-2 py-1 rounded " +
                (active
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200")
              }
            >
              {it.title}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

window.DemoUI = window.DemoUI || {};
window.DemoUI.PageNav = PageNav;