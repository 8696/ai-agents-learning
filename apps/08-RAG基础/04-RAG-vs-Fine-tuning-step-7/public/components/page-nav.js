// 职责：跨 sub-page 的顶部导航 tab，挂在 window.DemoUI.PageNav。
// 当前页面用 `<PageNav current="..." />` 即可拿到 8 个变体的入口 + 标高亮当前。
// 数据流：硬编码 8 个变体的标题 + 路径（不调 API）；高亮由 current prop 决定。
const { useState, useEffect } = React;

const NAV_ITEMS = [
  { id: "full-pipeline",  path: "/pages/full-pipeline.html",  title: "混合 pipeline · 检索 + system" },
];

function PageNav({ current }) {
  return (
    <nav className="border-b bg-white px-4 py-2 text-xs">
      <div className="container mx-auto flex flex-wrap items-center gap-2">
        <a href="/" className="font-semibold text-gray-700 mr-2">
          ← step-7 总览
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