/**
 * 职责：当前 step 顶部 tab 导航。同一份 lib/flow/ 核心，sub-page 之间切换。
 * 当前 mode 高亮；切换 = 跳到对应 page（多页之间用 <a>，不是单页 tab）。
 * 颜色：当前页蓝色边框 + 白底；其它页灰底。
 *
 * 同文件被 index.html 和 pages/*.html 同时引入；
 * base 由调用方传：""（index.html 在 public/）或 "../"（pages/*.html 在 public/pages/）。
 *
 * 每加一个新 sub-page：append PAGES 一行（key / label / href）。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview",        label: "总览 · 原句 vs 改写",     href: "index.html" },
    { key: "expansion",       label: "扩展 · 一条查询补词",     href: "pages/expansion.html" },
    { key: "anchor",          label: "锚点 · 跳过改写",         href: "pages/anchor.html" },
    { key: "fallback",        label: "失败兜底 · 原句回退",      href: "pages/fallback.html" },
    { key: "drift",           label: "改偏可回退",               href: "pages/drift.html" },
    { key: "residual",        label: "残句先写全",               href: "pages/residual.html" },
    { key: "subquestion",     label: "一句拆子问题",             href: "pages/subquestion.html" },
    { key: "dual-expansion",  label: "规则 vs 模型分列",         href: "pages/dual-expansion.html" },
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
