/**
 * 职责：顶部跨页导航。本步四页：总览 / 杀进程再批 / 超时默认拒绝 / 渠道失败 ≠ 人拒绝。
 * 数据流：props.current 高亮当前页；index 的 base 为空；pages/*.html 的 base 是 ../。
 * 为什么单独成文件：每个演示自己一份 page-nav.js，禁止跨演示 import。
 *
 * step-2 演示三个变体：E（杀进程再批）+ G（超时默认拒绝）+ F（渠道失败 ≠ 人拒绝）。
 * 通过 / 拒绝 / 改参数 / 只读对照 在 step-1 演示，step-2 不重复。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview", label: "总览 · 人机回圈 第二步",         href: "index.html" },
    { key: "restart",  label: "杀进程再批（单还在、钱没动）",   href: "pages/restart-recovery.html" },
    { key: "timeout",  label: "超时默认拒绝（30 秒演示）",      href: "pages/timeout-default.html" },
    { key: "channel",  label: "渠道失败 ≠ 人拒绝",              href: "pages/channel-failure.html" },
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
