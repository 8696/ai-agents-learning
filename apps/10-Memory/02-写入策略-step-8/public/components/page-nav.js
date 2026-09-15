/**
 * 职责：顶部跨页导航（第 5 关「冲突与更新」四个 sub-mode + 总览，按 §5.3.18 标准写）。
 * 数据流：PAGES → 当前项高亮 → 点了跳 href。
 *
 * 备注：访问 PAGES 元素字段一律用 item["key"] 而不是 item.key——
 *   避免 Babel 7.26.4 转译 JSX 时对 key 这个 prop 名的特殊处理跟外层访问冲突。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview",  label: "总览 · 冲突更新（第 5 关完整版）", href: "index.html" },
    { key: "actions",   label: "mode-actions · 四个动作",        href: "pages/conflict-actions.html" },
    { key: "merge",     label: "mode-merge · 合并多值",          href: "pages/conflict-merge.html" },
    { key: "soft",      label: "mode-soft-delete · 软删除",      href: "pages/conflict-soft-delete.html" },
    { key: "history",   label: "mode-history · 历史版本",        href: "pages/conflict-history.html" },
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
