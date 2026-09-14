/**
 * 职责：step-3 顶部 tab 导航。step-3 只有 1 个 mode（评测），不需要跨 demo 跳转链接。
 * 当前 mode 高亮；切换 = 跳到对应 page（多页之间用 <a>，本页内只有 eval.html）。
 *
 * 同文件被 index.html 和 pages/eval.html 同时引入；
 * base 由调用方传：""（index.html 在 public/）或 "../"（pages/eval.html 在 public/pages/）。
 */
(function () {
  const DemoUI = (window.DemoUI = window.DemoUI || {});

  const MODES = [
    { key: "eval", label: "① 评测集 + 命中率", file: "eval.html" },
  ];

  DemoUI.PageNav = function PageNav(props) {
    const current = props.current;
    const base = props.base || "";
    return (
      <nav className="bg-white border border-gray-200 rounded p-3 flex flex-wrap gap-2 text-sm">
        <a
          href={base + "index.html"}
          className="text-gray-500 px-2 py-1 rounded hover:bg-gray-100"
        >
          ← 回总览
        </a>
        <span className="text-gray-300">|</span>
        {MODES.map(function (item) {
          const active = item.key === current;
          return (
            <a
              key={item.key}
              href={base + "pages/" + item.file}
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
