/**
 * 职责：画一侧 Top-K 表（手写或 wink）+ 判定徽标。
 * 挂载：window.DemoUI.SideRankTable
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.SideRankTable = function SideRankTable({ title, side, verdict }) {
  if (!side) {
    return React.createElement("div", { className: "text-xs text-gray-400" }, "（还没跑）");
  }
  // 只有手写侧自己算得出 tokens / 命中词；wink.search 只回 [id, score]，库侧不展示假字段
  const showTokens = side.label === "handwritten" && Array.isArray(side.tokens);
  const showMatched = side.label === "handwritten";
  return React.createElement(
    "div",
    { className: "bg-white border border-gray-300 rounded p-3 space-y-2" },
    React.createElement("div", { className: "text-sm font-semibold text-gray-800" }, title),
    showTokens
      ? React.createElement(
          "div",
          { className: "text-xs text-gray-600" },
          "切出来的词（tokens）：",
          React.createElement("span", { className: "font-mono" }, side.tokens.join(" / ") || "（空）"),
        )
      : null,
    React.createElement(
      "div",
      { className: "text-xs text-gray-600" },
      "Top-1（cardId）：",
      React.createElement("span", { className: "font-mono font-semibold" }, side.top1 || "（空）"),
    ),
    verdict
      ? React.createElement(
          "div",
          {
            className:
              "text-xs px-2 py-1 rounded " +
              (verdict.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"),
          },
          verdict.passed ? "判定过 ✓ · " : "判定不过 ✗ · ",
          verdict.reason,
        )
      : null,
    React.createElement(
      "table",
      { className: "w-full text-xs border-collapse" },
      React.createElement(
        "thead",
        null,
        React.createElement(
          "tr",
          { className: "bg-gray-100 text-left" },
          React.createElement("th", { className: "border p-1" }, "名次"),
          React.createElement("th", { className: "border p-1" }, "cardId"),
          React.createElement("th", { className: "border p-1" }, "分数"),
          showMatched ? React.createElement("th", { className: "border p-1" }, "命中词") : null,
        ),
      ),
      React.createElement(
        "tbody",
        null,
        (side.rows || []).map(function (row) {
          return React.createElement(
            "tr",
            { key: row.cardId },
            React.createElement("td", { className: "border p-1" }, row.rank),
            React.createElement("td", { className: "border p-1 font-mono" }, row.cardId),
            React.createElement("td", { className: "border p-1 font-mono" }, Number(row.score).toFixed(4)),
            showMatched
              ? React.createElement(
                  "td",
                  { className: "border p-1" },
                  (row.matchedTerms || []).join("、") || "—",
                )
              : null,
          );
        }),
      ),
    ),
  );
};
