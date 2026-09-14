/**
 * 职责：标准 PageNav 组件。挂在 window.DemoUI.PageNav。
 * 当前页面用 <PageNav current="..." base="" /> 即可拿到所有 sub-page 入口 + 高亮当前。
 * 标准样式：卡片容器（bg-white border border-gray-200 rounded p-3）；
 *          当前页 = 白底蓝边 + 浅蓝底（border-blue-500 bg-blue-50 text-blue-700 font-semibold）；
 *          其他页 = 灰边白底（border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100）。
 * 注意：本组件没有"← 回总览"链接 —— 总览放在 PAGES 第一项即可。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
  {
    "key": "overview",
    "label": "总览 · Temperature / Top-P",
    "href": "index.html"
  },
  {
    "key": "repeat",
    "label": "重复稳定性 · Temperature / Top-P",
    "href": "pages/repeat.html"
  },
  {
    "key": "temperature",
    "label": "温度对照 · Temperature / Top-P",
    "href": "pages/temperature.html"
  },
  {
    "key": "top-p",
    "label": "Top-P 对照 · Temperature / Top-P",
    "href": "pages/top-p.html"
  }
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
