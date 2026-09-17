/**
 * 职责：step-5 自己的导航（总览 / 节点失败 ≠ 进程被杀掉）。
 * 数据流：props.current 高亮当前页；props.base 让 pages/ 下的链接回到 public 根。
 * 为什么单独成文件：跨页导航必须独立成 page-nav.js，禁止写进 layout.js。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview", label: "总览 · step-5", href: "index.html" },
    { key: "node-fail", label: "节点失败 ≠ 进程被杀掉", href: "pages/node-fail.html" },
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
