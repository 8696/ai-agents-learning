/**
 * 职责：把「混合 Top-K」画成一张卡 —— 每个卡显示「来源徽标（vector / bm25 / both）」
 *       + 原始分 + 拉齐后分 + 加权分 + 算式回显。
 * 挂载：window.DemoUI.HybridCard
 */
window.DemoUI = window.DemoUI || {};

function sourceBadge(source) {
  if (source === "both") return { text: "两侧都有", className: "bg-green-100 text-green-800" };
  if (source === "vector") return { text: "只向量侧", className: "bg-blue-100 text-blue-800" };
  return { text: "只 BM25 侧", className: "bg-purple-100 text-purple-800" };
}

window.DemoUI.HybridCard = function HybridCard({ title, status, result, expectedCardId }) {
  return React.createElement(
    "div",
    { className: "bg-white border border-gray-300 rounded p-3 space-y-2" },
    React.createElement(
      "div",
      { className: "text-sm font-semibold text-gray-700" },
      title,
    ),
    React.createElement(
      "div",
      { className: "text-xs text-gray-500" },
      "状态：",
      status,
    ),
    !result
      ? React.createElement("div", { className: "text-xs text-gray-400" }, "（还没跑）")
      : React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "div",
            { className: "text-xs text-gray-600" },
            "请求参数（question）：",
            React.createElement("span", { className: "font-mono" }, result.query),
            " · α=",
            result.alpha.toFixed(2),
            " · 拉齐（normalize）：",
            result.normalize ? "✅" : "❌（未拉齐）",
          ),
          React.createElement(
            "div",
            { className: "text-xs text-gray-600 mt-1" },
            "算式回显：score = α × 归一向量分 + (1-α) × 归一 BM25 分",
          ),
          React.createElement(
            "ol",
            { className: "text-sm" },
            result.rows.map((row) => {
              const badge = sourceBadge(row.source);
              const isHit = row.cardId === expectedCardId;
              return React.createElement(
                "li",
                { key: row.cardId, className: "border-b last:border-b-0 border-gray-200 py-2" },
                React.createElement(
                  "div",
                  { className: "flex items-center gap-2 text-xs text-gray-500 mb-1" },
                  React.createElement(
                    "span",
                    { className: "px-2 py-0.5 rounded bg-gray-200" },
                    "第 " + row.rank + " 名",
                  ),
                  React.createElement("span", { className: "font-mono" }, row.cardId),
                  React.createElement(
                    "span",
                    { className: "px-2 py-0.5 rounded " + badge.className },
                    badge.text,
                  ),
                  isHit
                    ? React.createElement(
                        "span",
                        { className: "px-2 py-0.5 rounded bg-green-100 text-green-800" },
                        "该中的卡 ✓",
                      )
                    : null,
                  React.createElement(
                    "span",
                    { className: "ml-auto font-mono text-gray-700" },
                    "加权分=" + row.score.toFixed(4),
                  ),
                ),
                React.createElement(
                  "div",
                  { className: "text-sm text-gray-800" },
                  row.text,
                ),
                React.createElement(
                  "div",
                  { className: "text-xs text-gray-600 mt-1 font-mono" },
                  "原始 向量=",
                  row.vectorScore.toFixed(4),
                  " · 归一 向量=",
                  row.vectorNorm.toFixed(4),
                  " · 原始 BM25=",
                  row.bm25Score.toFixed(4),
                  " · 归一 BM25=",
                  row.bm25Norm.toFixed(4),
                ),
              );
            }),
          ),
          result.rows.find((r) => r.cardId === expectedCardId)
            ? React.createElement(
                "div",
                { className: "text-xs text-gray-500 mt-1" },
                "期望命中的卡「" +
                  expectedCardId +
                  "」出现在第 " +
                  result.rows.find((r) => r.cardId === expectedCardId).rank +
                  " 名",
              )
            : React.createElement(
                "div",
                { className: "text-xs text-gray-500 mt-1" },
                "期望命中的卡「" + expectedCardId + "」未进入 Top-K（" + result.topK + "）",
              ),
        ),
  );
};