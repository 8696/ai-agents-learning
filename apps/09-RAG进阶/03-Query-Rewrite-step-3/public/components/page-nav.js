/**
 * 职责：当前 step 顶部 tab 导航。两个 sub-page：评测集 + 生成侧。
 * 颜色：当前页蓝色边框 + 白底；其它页灰底。
 *
 * base 由调用方传：""（index.html 在 public/）或 "../"（pages/*.html 在 public/pages/）。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = [
    { key: "overview",  label: "总览 · 评测 + 生成",  href: "index.html" },
    { key: "evaluate",  label: "评测集 · 命中率对照", href: "pages/evaluate.html" },
    { key: "generate",  label: "生成侧 · 拼 prompt + 调模型", href: "pages/generate.html" },
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