/**
 * 职责：顶部跨页导航。手写循环首页 / 框架循环子页 / 试用 useChat 子页。
 * 数据流：props.current 高亮；props.base 拼 href。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview", label: "手写循环（Agent Loop）", href: "index.html" },
    { key: "framework", label: "框架循环（Framework Loop）", href: "pages/framework.html" },
    { key: "use-chat", label: "试用 useChat（JSX）", href: "pages/use-chat.html" },
  ];

  DemoUI.PageNav = function PageNav(props) {
    const current = props.current;
    const base = props.base || "";
    return (
      <nav className="bg-white border border-gray-200 rounded p-3 flex flex-wrap gap-2 text-sm">
        {PAGES.map(function (item) {
          const active = item.key === current;
          return (
            <a
              key={item.key}
              href={base + item.href}
              className={
                "px-3 py-1 rounded border " +
                (active
                  ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                  : "border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100")
              }
            >
              {item.label}
            </a>
          );
        })}
      </nav>
    );
  };
})();
