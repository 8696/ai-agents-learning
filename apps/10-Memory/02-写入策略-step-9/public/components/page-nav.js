/**
 * 职责：顶部跨页导航（第 1 关「写入时机」三个 sub-mode + 总览，按 §5.3.18 标准写）。
 * 数据流：PAGES → 当前项高亮 → 点了跳 href。
 *
 * 备注：访问 PAGES 元素字段一律用 item["key"] 而不是 item.key——
 *   避免 Babel 7.26.4 转译 JSX 时对 key 这个 prop 名的特殊处理跟外层访问冲突。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview",      label: "总览 · 写入时机（第 1 关）",                       href: "index.html" },
    { key: "eager",         label: "热路径 · 每轮同步写（1-A）",                       href: "pages/chat-eager.html" },
    { key: "background",    label: "后台异步 · 不挡回复（1-B）",                       href: "pages/chat-background.html" },
    { key: "session-end",   label: "会话结束才写（1-C）",                                 href: "pages/chat-session-end.html" },
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
