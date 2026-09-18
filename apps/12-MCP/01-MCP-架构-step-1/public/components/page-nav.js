/**
 * 职责：顶部跨页导航。总览 = 初始化与工具发现；子页 = 调用工具 / 资源原语。
 * 数据流：current + base → 高亮当前页链接。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview", label: "总览 · 初始化与工具发现", href: "index.html" },
    { key: "tools-call", label: "调用工具（tools/call）", href: "pages/tools-call.html" },
    { key: "resources", label: "资源原语（resources/list + read）", href: "pages/resources.html" },
    { key: "prompts", label: "提示词模板（prompts/list + get）", href: "pages/prompts.html" },
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
