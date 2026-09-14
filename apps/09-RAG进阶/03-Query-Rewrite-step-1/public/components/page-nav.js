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
    "label": "总览 · 查询改写",
    "href": "index.html"
  },
  {
    "key": "anchor",
    "label": "锚点问句不改写（Anchor Skip） · 第一步",
    "href": "pages/anchor.html"
  },
  {
    "key": "drift",
    "label": "改偏可回退（Drift Fallback） · 故意改坏对照 + 一键回退 · 第一步",
    "href": "pages/drift.html"
  },
  {
    "key": "dual-expansion",
    "label": "规则 vs 模型分列 · 第一步",
    "href": "pages/dual-expansion.html"
  },
  {
    "key": "expansion",
    "label": "扩展（Query Expansion） · 一条查询补词 · 第一步",
    "href": "pages/expansion.html"
  },
  {
    "key": "fallback",
    "label": "失败兜底（Fallback） · 改写挂了用原句继续搜 · 第一步",
    "href": "pages/fallback.html"
  },
  {
    "key": "residual",
    "label": "残句先写全（Residual Resolution） · 第一步",
    "href": "pages/residual.html"
  },
  {
    "key": "subquestion",
    "label": "一句拆成子问题（Sub-question Splitting） · 第一步",
    "href": "pages/subquestion.html"
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
