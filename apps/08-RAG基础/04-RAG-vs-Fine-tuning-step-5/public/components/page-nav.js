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
    "label": "总览 · RAG vs Fine-tuning",
    "href": "index.html"
  },
  {
    "key": "capability-boundary",
    "label": "RAG vs Fine-tuning · 能力边界：检索不教新流程 · 需求 12 · 决策卡",
    "href": "pages/capability-boundary.html"
  },
  {
    "key": "cost-card",
    "label": "RAG vs Fine-tuning · 成本对照：改 10 次 vs 训 10 次 · 变体 9 · 决策卡",
    "href": "pages/cost-card.html"
  },
  {
    "key": "fewshot-vs-finetune",
    "label": "RAG vs Fine-tuning · 检索范例当少样本 ≠ 已微调 · 需求 13 · 决策卡",
    "href": "pages/fewshot-vs-finetune.html"
  },
  {
    "key": "human-in-the-loop",
    "label": "RAG vs Fine-tuning · 两者都不够：人在回路 · 需求 14 · 决策卡",
    "href": "pages/human-in-the-loop.html"
  },
  {
    "key": "privacy-irreversible",
    "label": "RAG vs Fine-tuning · 隐私：进权重当删不掉 · 需求 11 · 决策卡",
    "href": "pages/privacy-irreversible.html"
  },
  {
    "key": "style-vs-structured",
    "label": "RAG vs Fine-tuning · 风格稳 → 才考虑微调 · 需求 3 · 决策卡",
    "href": "pages/style-vs-structured.html"
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
