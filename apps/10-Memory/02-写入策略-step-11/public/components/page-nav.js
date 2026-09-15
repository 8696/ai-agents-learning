/**
 * 职责：顶部跨页导航（第 6 关「过期」总览 + sub-page，按 §5.3.18 标准写）。
 * 数据流：PAGES → 当前项高亮 → 点了跳 href。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview",      label: "总览 · 过期（第 6 关）",                   href: "index.html" },
    { key: "link",          label: "6-D 被新事实挤掉（关联键）",                 href: "pages/expire-linked.html" },
  ];

  DemoUI.PageNav = function PageNav(props) {
    const current = props.current;
    const base = props.base || "";
    return (
      <nav className="bg-white border border-gray-200 rounded p-3 flex flex-wrap gap-2 text-sm">
        {PAGES.map(function (item) {
          const itemKey = item["key"];
          const active = itemKey === current;
          return (
            <a
              key={itemKey}
              href={base + item["href"]}
              className={
                "px-3 py-1 rounded border " +
                (active
                  ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                  : "border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100")
              }
            >
              {item["label"]}
            </a>
          );
        })}
      </nav>
    );
  };
})();