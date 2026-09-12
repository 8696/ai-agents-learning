/**
 * 职责：把「切词对照」画成一张卡 —— 同问句两次 BM25 → 两张 Top-K 表并排。
 *       显示 tokens 列表（让人看见「SKU-8821」在 keep-dash 是 1 个 token，在 split-chars 是 8 个单字）。
 * 挂载：window.DemoUI.TokenizeCompare
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.TokenizeCompare = function TokenizeCompare({
  title,
  question,
  expectedCardId,
}) {
  const [result, setResult] = React.useState(null);
  const [status, setStatus] = React.useState("⏸ 待连接");

  async function run() {
    setStatus("🔄 请求中");
    try {
      const response = await fetch("/api/search-bm25-variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, topK: 5 }),
      });
      const json = await response.json();
      if (!json.ok) {
        setStatus("❌ 错误 · " + (json.error || "未知"));
        return;
      }
      setResult(json.result);
      setStatus("✅ 完成");
    } catch (error) {
      setStatus("❌ 错误 · " + String(error));
    }
  }

  function renderSide(label, side) {
    if (!side) return React.createElement("div", { className: "text-xs text-gray-400" }, "（还没跑）");
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
      React.createElement(
        "div",
        { className: "text-xs text-gray-600" },
        "切词模式（mode）：",
        React.createElement("span", { className: "font-mono ml-1" }, side.mode),
      ),
      React.createElement(
        "div",
        { className: "text-xs text-gray-600 mt-1" },
        "tokens 列表：",
        React.createElement(
          "span",
          { className: "font-mono ml-1" },
          side.tokens.join(" / "),
        ),
        " · 共 ",
        side.tokens.length,
        " 个",
      ),
      React.createElement(
        "table",
        { className: "w-full text-xs border-collapse mt-1" },
        React.createElement(
          "thead",
          null,
          React.createElement(
            "tr",
            { className: "bg-gray-100 text-left" },
            React.createElement("th", { className: "border p-1" }, "rank"),
            React.createElement("th", { className: "border p-1" }, "cardId"),
            React.createElement("th", { className: "border p-1" }, "命中词"),
            React.createElement("th", { className: "border p-1" }, "BM25 分"),
          ),
        ),
        React.createElement(
          "tbody",
          null,
          side.rows.map((row) =>
            React.createElement(
              "tr",
              {
                key: row.cardId,
                className: (row.cardId === expectedCardId ? "bg-yellow-50 " : "") + "even:bg-gray-50",
              },
              React.createElement("td", { className: "border p-1" }, row.rank),
              React.createElement("td", { className: "border p-1 font-mono" }, row.cardId),
              React.createElement(
                "td",
                { className: "border p-1 text-xs" },
                row.matchedTerms.join("、") || "（无）",
              ),
              React.createElement("td", { className: "border p-1 font-mono" }, row.score.toFixed(4)),
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
      React.createElement(
        "button",
        {
          className: "text-sm px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50",
          onClick: run,
        },
        "跑切词对照（一次请求 = 两次 BM25）",
      ),
    ),
    React.createElement(
      "div",
      { className: "text-xs text-gray-600" },
      "教学点：「",
      React.createElement("code", { className: "font-mono" }, "keep-dash"),
      "」把 ",
      React.createElement("code", { className: "font-mono" }, "SKU-8821"),
      " 当 1 个 token（IDF 极高 → BM25 中）；「",
      React.createElement("code", { className: "font-mono" }, "split-chars"),
      "」撕成 8 个单字（编号被撕碎 → BM25 通道退化）。同一问句、同 BM25公式，排名变了。",
    ),
    React.createElement(
      "div",
      { className: "grid grid-cols-1 md:grid-cols-2 gap-3" },
      renderSide("保留连字符（keep-dash）", result ? result.keepDash : null),
      renderSide("撕成单字（split-chars）", result ? result.splitChars : null),
    ),
  );
};