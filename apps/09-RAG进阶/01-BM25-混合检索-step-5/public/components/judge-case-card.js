/**
 * 职责：一条判定用例的卡片——说明 + 跑按钮 + 两侧对照。
 * 挂载：window.DemoUI.JudgeCaseCard
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.JudgeCaseCard = function JudgeCaseCard({ caseItem, onRun, busy, result }) {
  const both = result && result.bothPassed;
  const agree = result && result.agree;
  return React.createElement(
    "section",
    { className: "bg-white border border-gray-200 rounded p-3 space-y-2" },
    React.createElement(
      "div",
      { className: "flex flex-wrap items-center gap-2" },
      React.createElement("h3", { className: "text-sm font-semibold text-gray-800" }, caseItem.title),
      React.createElement("span", { className: "text-xs font-mono text-gray-500" }, caseItem.id),
      result
        ? React.createElement(
            "span",
            {
              className:
                "text-xs px-2 py-0.5 rounded " +
                (both ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"),
            },
            both ? "两侧都过" : "有一侧不过",
          )
        : null,
      result
        ? React.createElement(
            "span",
            {
              className:
                "text-xs px-2 py-0.5 rounded " +
                (agree ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"),
            },
            agree ? "Top-1 一致" : "Top-1 不一致",
          )
        : null,
      React.createElement(
        "button",
        {
          className: "ml-auto text-sm px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50",
          disabled: busy,
          onClick: function () {
            onRun(caseItem.id);
          },
        },
        "跑本条判定（/api/judge-run · one）",
      ),
    ),
    React.createElement(
      "div",
      { className: "text-xs text-gray-700" },
      "问句（question）：",
      React.createElement("span", { className: "font-mono" }, caseItem.question),
    ),
    React.createElement("div", { className: "text-xs text-gray-600" }, caseItem.explain),
    React.createElement(
      "div",
      { className: "text-xs text-gray-500" },
      "规则（rule）：",
      caseItem.rule,
      " · 期望（expectTop1）：",
      React.createElement("span", { className: "font-mono" }, String(caseItem.expectTop1)),
    ),
    result
      ? React.createElement(
          "div",
          { className: "grid grid-cols-1 md:grid-cols-2 gap-3" },
          React.createElement(window.DemoUI.SideRankTable, {
            title: result.compare.handwritten.displayName,
            side: result.compare.handwritten,
            verdict: result.handwritten,
          }),
          React.createElement(window.DemoUI.SideRankTable, {
            title: result.compare.wink.displayName,
            side: result.compare.wink,
            verdict: result.wink,
          }),
        )
      : React.createElement("div", { className: "text-xs text-gray-400" }, "还没跑；点右侧按钮。"),
  );
};
