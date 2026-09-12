/**
 * 职责：「未拉齐 vs 拉齐后」对照卡 —— 同一问句调两次 searchHybrid（normalize=false / true）
 *       把两份 Top-K 并排展示，让人看见「不拉齐时 α=0.8 仍然偏 BM25」（因为 BM25 原始分大一个数量级）。
 * 挂载：window.DemoUI.NormalizeCompare
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.NormalizeCompare = function NormalizeCompare({
  title,
  question,
  alpha,
  expectedCardId,
}) {
  const [withoutNorm, setWithoutNorm] = React.useState(null);
  const [withNorm, setWithNorm] = React.useState(null);
  const [withoutStatus, setWithoutStatus] = React.useState("⏸ 待连接");
  const [withStatus, setWithStatus] = React.useState("⏸ 待连接");

  async function runOnce(normalize, setter, statusSetter) {
    statusSetter("🔄 请求中");
    try {
      const response = await fetch("/api/search-hybrid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, alpha, topK: 3, normalize }),
      });
      const json = await response.json();
      if (!json.ok) {
        statusSetter("❌ 错误 · " + (json.error || "未知"));
        return;
      }
      setter(json.result);
      statusSetter("✅ 完成");
    } catch (error) {
      statusSetter("❌ 错误 · " + String(error));
    }
  }

  function run() {
    runOnce(false, setWithoutNorm, setWithoutStatus);
    runOnce(true, setWithNorm, setWithStatus);
  }

  function renderTable(label, result) {
    if (!result) return React.createElement("div", { className: "text-xs text-gray-400" }, "（还没跑）");
    return React.createElement(
      "table",
      { className: "w-full text-xs border-collapse" },
      React.createElement(
        "thead",
        null,
        React.createElement(
          "tr",
          { className: "bg-gray-100 text-left" },
          React.createElement("th", { className: "border p-1" }, "rank"),
          React.createElement("th", { className: "border p-1" }, "cardId"),
          React.createElement("th", { className: "border p-1" }, "来源"),
          React.createElement("th", { className: "border p-1" }, "加权分"),
          React.createElement("th", { className: "border p-1" }, "原始向量 / BM25"),
        ),
      ),
      React.createElement(
        "tbody",
        null,
        result.rows.map((row) =>
          React.createElement(
            "tr",
            { key: row.cardId, className: (row.cardId === expectedCardId ? "bg-yellow-50 " : "") + "even:bg-gray-50" },
            React.createElement("td", { className: "border p-1" }, row.rank),
            React.createElement("td", { className: "border p-1 font-mono" }, row.cardId),
            React.createElement("td", { className: "border p-1" }, row.source),
            React.createElement("td", { className: "border p-1 font-mono" }, row.score.toFixed(4)),
            React.createElement(
              "td",
              { className: "border p-1 font-mono" },
              row.vectorScore.toFixed(3) + " / " + row.bm25Score.toFixed(3),
            ),
          ),
        ),
      ),
    );
  }

  return React.createElement(
    "section",
    { className: "bg-yellow-50 border border-yellow-300 rounded p-3 space-y-2" },
    React.createElement(
      "div",
      { className: "flex flex-wrap items-center gap-2" },
      React.createElement(
        "h3",
        { className: "text-sm font-semibold text-yellow-900" },
        title,
      ),
      React.createElement("span", { className: "text-xs text-gray-600" }, "问句（question）："),
      React.createElement("span", { className: "text-xs font-mono" }, question),
      React.createElement("span", { className: "text-xs text-gray-600" }, "α="),
      React.createElement("span", { className: "text-xs font-mono" }, alpha.toFixed(2)),
      React.createElement(
        "button",
        {
          className: "text-sm px-3 py-1 bg-yellow-600 text-white rounded disabled:opacity-50",
          onClick: run,
        },
        "跑对照（两次请求）",
      ),
    ),
    React.createElement(
      "div",
      { className: "text-xs text-yellow-900" },
      "教学点：α=",
      alpha.toFixed(2),
      " 想偏向量侧，但「未拉齐」时 BM25 原始分比余弦大一个数量级，加权后仍然偏 BM25；「拉齐后」α 才真有用。",
    ),
    React.createElement(
      "div",
      { className: "grid grid-cols-1 md:grid-cols-2 gap-3" },
      React.createElement(
        "div",
        { className: "bg-white border border-gray-300 rounded p-2" },
        React.createElement(
          "div",
          { className: "text-xs font-semibold text-gray-700 mb-1" },
          "未拉齐（normalize=false）· 状态：",
          withoutStatus,
        ),
        renderTable("未拉齐", withoutNorm),
      ),
      React.createElement(
        "div",
        { className: "bg-white border border-gray-300 rounded p-2" },
        React.createElement(
          "div",
          { className: "text-xs font-semibold text-gray-700 mb-1" },
          "拉齐后（normalize=true）· 状态：",
          withStatus,
        ),
        renderTable("拉齐后", withNorm),
      ),
    ),
    React.createElement(
      "div",
      { className: "text-xs text-gray-600" },
      "怎么读：左边那张表是「直接加权」的结果；右边那张表是「先拉齐再加权」的结果。黄底 = 期望命中的卡。",
    ),
  );
};