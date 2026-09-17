/**
 * 职责：顶部跨页导航。总览 + 线性 FAQ + 七个对象 + 条件路由 + 循环回边 + 非法转移 + 节点失败 + 并行汇合。
 * 数据流：props.current 高亮当前页；index 的 base 为空，pages/*.html 的 base 为 ../。
 * 为什么单独成文件：§5.3.18 规定每个演示自己一份 page-nav.js，禁止跨演示 import。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview", label: "总览 · 状态机", href: "index.html" },
    { key: "linear", label: "线性 FAQ · 走一步", href: "pages/linear.html" },
    { key: "objects", label: "七个对象", href: "pages/objects.html" },
    { key: "routing", label: "条件路由", href: "pages/routing.html" },
    { key: "loop", label: "循环回边", href: "pages/loop.html" },
    { key: "illegal", label: "非法转移", href: "pages/illegal.html" },
    { key: "nodeFail", label: "节点失败", href: "pages/node-fail.html" },
    { key: "parallel", label: "并行汇合", href: "pages/parallel.html" },
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
