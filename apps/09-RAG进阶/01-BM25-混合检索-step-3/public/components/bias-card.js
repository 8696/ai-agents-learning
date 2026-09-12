/**
 * 职责：把「按问句偏置 α」的检测结果画成一张卡 —— 显示分类（编号 / 口语 / 两者都有）+ 建议 α + 触发原因。
 * 挂载：window.DemoUI.BiasCard
 */
window.DemoUI = window.DemoUI || {};

function categoryBadge(category) {
  if (category === "numbered") return { text: "纯编号问", className: "bg-purple-100 text-purple-800" };
  if (category === "spoken") return { text: "纯口语问", className: "bg-blue-100 text-blue-800" };
  if (category === "mixed") return { text: "编号 + 口语", className: "bg-green-100 text-green-800" };
  return { text: "未分类", className: "bg-gray-200 text-gray-700" };
}

window.DemoUI.BiasCard = function BiasCard({ status, result, alpha, onApplyAlpha }) {
  const badge = result ? categoryBadge(result.category) : null;
  return React.createElement(
    "div",
    { className: "bg-white border border-gray-300 rounded p-3 space-y-2" },
    React.createElement(
      "div",
      { className: "text-sm font-semibold text-gray-700" },
      "按问句偏置 α · 自动检测",
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
            "问句（question）：",
            React.createElement("span", { className: "font-mono" }, result.query),
          ),
          React.createElement(
            "div",
            { className: "text-xs text-gray-600 mt-1 flex flex-wrap items-center gap-2" },
            React.createElement(
              "span",
              { className: "px-2 py-0.5 rounded " + badge.className },
              badge.text,
            ),
            React.createElement("span", null, "检测到编号（hasNumbered）："),
            React.createElement(
              "span",
              { className: "px-2 py-0.5 rounded " + (result.hasNumbered ? "bg-purple-100 text-purple-800" : "bg-gray-200 text-gray-700") },
              result.hasNumbered ? "✅" : "❌",
            ),
            React.createElement("span", null, "检测到口语（hasSpoken）："),
            React.createElement(
              "span",
              { className: "px-2 py-0.5 rounded " + (result.hasSpoken ? "bg-blue-100 text-blue-800" : "bg-gray-200 text-gray-700") },
              result.hasSpoken ? "✅" : "❌",
            ),
          ),
          React.createElement(
            "div",
            { className: "text-xs text-gray-600 mt-1" },
            "建议 α（suggestedAlpha，向量权重）：",
            React.createElement("span", { className: "font-mono ml-1" }, result.suggestedAlpha.toFixed(2)),
            "（当前 α=",
            alpha.toFixed(2),
            "）",
          ),
          React.createElement(
            "div",
            { className: "text-xs text-gray-600 mt-1" },
            "触发原因（reason）：",
            result.reason,
          ),
          onApplyAlpha
            ? React.createElement(
                "button",
                {
                  className: "text-xs px-2 py-1 bg-blue-600 text-white rounded mt-1",
                  onClick: () => onApplyAlpha(result.suggestedAlpha),
                },
                "采用建议 α（应用到共享控件）",
              )
            : null,
        ),
  );
};