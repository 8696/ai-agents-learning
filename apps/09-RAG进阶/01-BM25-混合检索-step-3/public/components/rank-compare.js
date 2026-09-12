/**
 * 职责：「RRF vs 加权」对照卡 —— 同一问句调两次（一次 /api/search-hybrid 一次 /api/search-rrf），
 *       把两份 Top-K 并排展示，让人看见「加权 + 拉齐」和「RRF 名次投票」出来的排名差异。
 * 挂载：window.DemoUI.RankCompare
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.RankCompare = function RankCompare({
  title,
  question,
  alpha,
  normalize,
  expectedCardId,
}) {
  const [hybrid, setHybrid] = React.useState(null);
  const [rrf, setRrf] = React.useState(null);
  const [hybridStatus, setHybridStatus] = React.useState("⏸ 待连接");
  const [rrfStatus, setRrfStatus] = React.useState("⏸ 待连接");

  async function runOnce(url, body, setter, statusSetter) {
    statusSetter("🔄 请求中");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    runOnce(
      "/api/search-hybrid",
      { question, alpha, normalize, topK: 5 },
      setHybrid,
      setHybridStatus,
    );
    runOnce("/api/search-rrf", { question, topK: 5 }, setRrf, setRrfStatus);
  }

  function renderSide(label, result, status, scoreLabel, scoreKey) {
    return React.createElement(
      "div",
      { className: "bg-white border border-gray-300 rounded p-2" },
      React.createElement(
        "div",
        { className: "text-xs font-semibold text-gray-700 mb-1" },
        label,
        " · 状态：",
        status,
      ),
      !result
        ? React.createElement("div", { className: "text-xs text-gray-400" }, "（还没跑）")
        : React.createElement(
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
                React.createElement("th", { className: "border p-1" }, scoreLabel),
              ),
            ),
            React.createElement(
              "tbody",
              null,
              result.rows.map((row) =>
                React.createElement(
                  "tr",
                  {
                    key: row.cardId,
                    className: (row.cardId === expectedCardId ? "bg-yellow-50 " : "") + "even:bg-gray-50",
                  },
                  React.createElement("td", { className: "border p-1" }, row.rank),
                  React.createElement("td", { className: "border p-1 font-mono" }, row.cardId),
                  React.createElement("td", { className: "border p-1" }, row.source),
                  React.createElement("td", { className: "border p-1 font-mono" }, row[scoreKey].toFixed(4)),
                ),
              ),
            ),
          ),
    );
  }

  return React.createElement(
    "section",
    { className: "bg-gray-50 border border-gray-200 rounded p-3 space-y-2" },
    React.createElement(
      "div",
      { className: "flex flex-wrap items-center gap-2" },
      React.createElement("h3", { className: "text-sm font-semibold text-gray-800" }, title),
      React.createElement("span", { className: "text-xs text-gray-600" }, "问句（question）："),
      React.createElement("span", { className: "text-xs font-mono" }, question),
      React.createElement("span", { className: "text-xs text-gray-600" }, "α="),
      React.createElement("span", { className: "text-xs font-mono" }, alpha.toFixed(2)),
      React.createElement(
        "button",
        {
          className: "text-sm px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50",
          onClick: run,
        },
        "跑对照（两次请求）",
      ),
    ),
    React.createElement(
      "div",
      { className: "text-xs text-gray-600" },
      "教学点：α=",
      alpha.toFixed(2),
      " + 拉齐（加权路径）vs RRF 名次投票（不看分数）—— 看同一问句两种融合谁赢。",
    ),
    React.createElement(
      "div",
      { className: "grid grid-cols-1 md:grid-cols-2 gap-3" },
      renderSide("加权 + 拉齐（加权分）", hybrid, hybridStatus, "加权分", "score"),
      renderSide("RRF 名次投票（RRF 分）", rrf, rrfStatus, "RRF 分", "rrfScore"),
    ),
  );
};