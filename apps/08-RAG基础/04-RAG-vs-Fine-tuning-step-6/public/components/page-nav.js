// 职责：跨 sub-page 的顶部导航 tab，挂在 window.DemoUI.PageNav。
// 当前页面用 `<PageNav current="..." />` 即可拿到 3 个决策模式 + 总览的入口 + 标高亮当前。
const { useState, useEffect } = React;

const NAV_ITEMS = [
  { id: "routing-rules",   path: "/pages/routing-rules.html",   title: "路由层规则 · 关键词判断" },
  { id: "threshold",       path: "/pages/threshold.html",       title: "命中阈值 · top1 score > N" },
  { id: "agent-decide",    path: "/pages/agent-decide.html",    title: "模型自己决定 · agent loop" },
];

function PageNav({ current }) {
  return (
    <nav className="border-b bg-white px-4 py-2 text-xs">
      <div className="container mx-auto flex flex-wrap items-center gap-2">
        <a href="/" className="font-semibold text-gray-700 mr-2">
          ← step-6 总览
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