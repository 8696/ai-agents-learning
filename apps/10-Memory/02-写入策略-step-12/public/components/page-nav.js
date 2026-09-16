/**
 * 职责：顶部跨页导航（第 7 关「压缩与摘要」总览 + sub-page，按 §5.3.18 标准写）。
 * 数据流：PAGES → 当前项高亮 → 点了跳 href。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview",          label: "总览 · 压缩（第 7 关）",        href: "index.html" },
    { key: "compress-session",  label: "整段 → 会话摘要",              href: "pages/compress-session.html" },
    { key: "compress-image",    label: "多条零碎 → 画像",              href: "pages/compress-image.html" },
    { key: "auto-merge",        label: "库容量上限 + 自动合并",          href: "pages/auto-merge.html" },
    { key: "recall-preview",    label: "跨会话验证 + 调取预览",        href: "pages/recall-preview.html" },
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
