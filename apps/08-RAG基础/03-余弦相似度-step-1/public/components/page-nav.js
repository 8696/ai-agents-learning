/**
 * 职责：三页导航栏。挂 window.DemoUI。
 *       当前页面对应 tab 高亮。
 */
(function () {
  const DemoUI = (window.DemoUI = window.DemoUI || {});

  DemoUI.PageNav = function PageNav(props) {
    const current = props.current;
    const items = [
      { key: "raw",        label: "① 余弦对照（raw）",                  href: "/pages/cosine.html" },
      { key: "topk",       label: "② Top-K 截断（topk）",              href: "/pages/topk.html" },
      { key: "threshold",  label: "③ Top-K + 阈值弃权（threshold）",   href: "/pages/threshold.html" },
      { key: "crossmodel", label: "④ 跨模型重标定（cross-model）",     href: "/pages/cross-model.html" },
      { key: "contrast",   label: "⑤ 距离排序对照（contrast）",        href: "/pages/contrast.html" },
      { key: "normalize",  label: "⑥ 归一化（normalize）",             href: "/pages/normalize.html" },
    ];
    return (
      <nav id="page-nav" className="bg-white border-b">
        <div className="container mx-auto p-2 flex flex-wrap gap-2 text-xs">
          {items.map(function (item) {
            const active = item.key === current;
            const cls = active
              ? "bg-blue-600 text-white px-3 py-1.5 rounded"
              : "border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50";
            return (
              <a key={item.key} href={item.href} className={cls}>
                {item.label}
              </a>
            );
          })}
          <a href="/" className="border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 ml-auto">
            ← 总览
          </a>
        </div>
      </nav>
    );
  };
})();