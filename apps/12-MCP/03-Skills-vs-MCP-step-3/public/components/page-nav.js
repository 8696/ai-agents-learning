/**
 * 职责：跨 sub-page 的导航条（顶部 tab + 高亮当前页）。本 step 单 sub-page：short-catalog 演示页。
 * 数据流：current → 高亮当前 tab。
 * 为什么单独成文件：单 tab 仍用 PageNav 一致性，方便未来加更多 tab 时不用改结构。
 */
(function () {
  function PageNav(props) {
    const cur = props.current || "short-catalog";
    const tabs = [
      { id: "short-catalog", label: "短目录 vs 全文",   href: "/" },
    ];
    return (
      <nav id="page-nav" className="bg-white border-b px-4 py-2 flex flex-wrap gap-2 text-sm">
        <span className="text-xs text-gray-500 self-center mr-2">本页（step-3）导航</span>
        {tabs.map(function (t) {
          const isCur = t.id === cur;
          const cls = isCur
            ? "px-3 py-1 rounded bg-blue-600 text-white"
            : "px-3 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200";
          return (
            <a key={t.id} href={t.href} id={"nav-" + t.id} className={cls}>
              {t.label}
            </a>
          );
        })}
        <span className="text-xs text-gray-400 self-center ml-2">
          三装配 + system prompt 装载见 step-1（端口 50136）；分类题 + 三种提示词入口见 step-2（端口 50137）
        </span>
      </nav>
    );
  }
  window.DemoUI = Object.assign(window.DemoUI || {}, { PageNav: PageNav });
})();