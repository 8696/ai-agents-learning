/**
 * 职责：顶部跨页导航。本步四页：总览 / 通过 / 拒绝 / 只读对照。
 * 数据流：props.current 高亮当前页；index 的 base 为空；pages/*.html 的 base 是 ../。
 * 为什么单独成文件：每个演示自己一份 page-nav.js，禁止跨演示 import。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview", label: "总览 · 人机回圈 第一步",            href: "index.html" },
    { key: "approve",  label: "通过（点头才扣款）",                href: "pages/approve.html" },
    { key: "reject",   label: "拒绝（副作用为零）",                href: "pages/reject.html" },
    { key: "read",     label: "只读对照（查余额自动走）",          href: "pages/readonly.html" },
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
