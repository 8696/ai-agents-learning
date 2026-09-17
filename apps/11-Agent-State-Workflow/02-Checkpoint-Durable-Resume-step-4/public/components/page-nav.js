/**
 * 职责：本演示五页之间的顶部导航（总览 / 写入检查点 / 不可序列化 / 从磁盘恢复 / 扣款后还没写成）。
 * 数据流：props.current 高亮当前页；props.base 让 pages/ 下的链接回到 public 根。
 * 为什么单独成文件：跨页导航必须独立成 page-nav.js，禁止写进 layout.js。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview", label: "总览 · step-4", href: "index.html" },
    { key: "graph-version", label: "图版本失败可见", href: "pages/graph-version.html" },
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
