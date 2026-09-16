/**
 * 职责：顶部跨页导航（第 8 关「写入安全与审计」总览 + sub-page，按 §5.3.18 标准写）。
 * 数据流：PAGES → 当前项高亮 → 点了跳 href。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview",   label: "总览 · 写入安全与审计（第 8 关）",   href: "index.html" },
    { key: "poison",     label: "8-A 投毒拦截",                       href: "pages/poison.html" },
    { key: "audit",      label: "8-B 审计表 + 一键撤回",              href: "pages/audit.html" },
    { key: "idempotent", label: "8-C 写入幂等",                       href: "pages/idempotent.html" },
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
