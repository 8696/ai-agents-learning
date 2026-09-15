/**
 * 职责：顶部跨页导航（第 4 关「去重」三个 sub-mode + 总览，按 §5.3.18 标准写）。
 * 数据流：PAGES → 当前项高亮 → 点了跳 href。
 *
 * 备注：访问 PAGES 元素字段一律用 item["key"] 而不是 item.key——
 *   避免 Babel 7.26.4 转译 JSX 时对 key 这个 prop 名的特殊处理跟外层访问冲突。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview", label: "总览 · 去重（第 4 关完整版）", href: "index.html" },
    { key: "literal", label: "变体 4-A · 字面去重", href: "pages/dedup-literal.html" },
    { key: "semantic", label: "变体 4-C · 跨 key 嵌入相似度", href: "pages/dedup-semantic.html" },
    { key: "inclusion", label: "变体 4-D · 包含关系粒度比对", href: "pages/dedup-inclusion.html" },
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