/**
 * 职责：跨 sub-page 的导航条（顶部 tab + 高亮当前页）。三个 tab 对应 step-1 的三个 sub-page。
 * 数据流：current → 高亮当前 tab；其它 tab 跳到对应 HTML。
 * 为什么单独成文件：每个 sub-page 都引同一个组件，避免在三处重复 tab 标签和顺序。
 */
(function () {
  function PageNav(props) {
    const cur = props.current || "index";
    const tabs = [
      { id: "index",              label: "三装配对照",        href: "/" },
      { id: "system-prompt-full", label: "系统提示词塞满",    href: "/pages/system-prompt-full.html" },
      { id: "on-demand",          label: "按需加载技能",      href: "/pages/on-demand.html" },
    ];
    return (
      <nav id="page-nav" className="bg-white border-b px-4 py-2 flex flex-wrap gap-2 text-sm">
        <span className="text-xs text-gray-500 self-center mr-2">本页（step-1）导航</span>
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
      </nav>
    );
  }
  window.DemoUI = Object.assign(window.DemoUI || {}, { PageNav: PageNav });
})();