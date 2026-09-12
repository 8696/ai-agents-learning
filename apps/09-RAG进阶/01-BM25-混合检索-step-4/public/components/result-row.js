/**
 * 职责：单卡结果行 +「匹配方式」徽标。
 *   - 向量侧：算余弦相似度 → 显示「cos=0.78 · 方向接近」或「cos=0.32 · 方向偏离」。
 *   - BM25 侧：把命中词拆出来 →「稀有词命中：SKU-8821（IDF 高，拉分强）」或「常见词命中：保修（IDF 低，几乎不加分）」。
 * 挂载：window.DemoUI.ResultRow
 */
window.DemoUI = window.DemoUI || {};

function vectorReason(score) {
  if (score >= 0.75) {
    return { text: "方向非常接近 · 夹角小", tone: "green" };
  }
  if (score >= 0.5) {
    return { text: "方向接近", tone: "green" };
  }
  if (score >= 0.3) {
    return { text: "方向偏离", tone: "yellow" };
  }
  return { text: "方向很远", tone: "red" };
}

function toneClasses(tone) {
  if (tone === "green") return "bg-green-100 text-green-800";
  if (tone === "yellow") return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

window.DemoUI.ResultRow = function ResultRow({
  row,
  isHit,
  scoreLabel,
  side,
  queryTokens,
}) {
  const matched = (row.matchedTerms || []).slice();
  const matchedRare = matched.filter((t) => /[A-Z]|-|\d/.test(t));
  const matchedCommon = matched.filter((t) => !matchedRare.includes(t));

  let reasonNode = null;
  if (side === "vector") {
    const reason = vectorReason(row.score);
    reasonNode = React.createElement(
      "div",
      { className: "text-xs text-gray-600 mt-1" },
      "匹配方式（向量侧）：",
      React.createElement(
        "span",
        { className: "px-2 py-0.5 rounded " + toneClasses(reason.tone) + " ml-1" },
        "cos=" + row.score.toFixed(4) + " · " + reason.text,
      ),
    );
  } else {
    // BM25 侧：把命中词按「稀有 / 常见」分两组讲解
    const rareText = matchedRare.length
      ? matchedRare.join("、") + "（含字母 / 连字符 / 数字 → IDF 高，拉分强）"
      : "无稀有词命中";
    const commonText = matchedCommon.length
      ? matchedCommon.join("、") + "（普通中文 → IDF 低，几乎不加分）"
      : "无常见词命中";
    reasonNode = React.createElement(
      "div",
      { className: "text-xs text-gray-600 mt-1" },
      React.createElement(
        "div",
        null,
        "匹配方式（BM25 侧）：",
        React.createElement(
          "span",
          { className: "px-2 py-0.5 rounded bg-blue-100 text-blue-800 ml-1" },
          "命中词（matchedTerms）：" + (matched.length ? matched.join("、") : "无"),
        ),
      ),
      React.createElement(
        "div",
        { className: "mt-1" },
        "稀有词命中（rare · IDF 高）：",
        React.createElement(
          "span",
          { className: "px-2 py-0.5 rounded bg-green-100 text-green-800 ml-1" },
          rareText,
        ),
      ),
      React.createElement(
        "div",
        { className: "mt-1" },
        "常见词命中（common · IDF 低）：",
        React.createElement(
          "span",
          { className: "px-2 py-0.5 rounded bg-gray-200 text-gray-700 ml-1" },
          commonText,
        ),
      ),
    );
  }

  const scoreBadge =
    side === "vector"
      ? React.createElement(
          "span",
          { className: "font-mono text-gray-700" },
          scoreLabel + row.score.toFixed(4),
        )
      : React.createElement(
          "span",
          { className: "font-mono text-gray-700" },
          scoreLabel + row.score.toFixed(4),
        );

  return React.createElement(
    "li",
    { className: "border-b last:border-b-0 border-gray-200 py-2" },
    React.createElement(
      "div",
      { className: "flex items-center gap-2 text-xs text-gray-500 mb-1" },
      React.createElement(
        "span",
        { className: "px-2 py-0.5 rounded bg-gray-200" },
        "第 " + row.rank + " 名",
      ),
      React.createElement("span", { className: "font-mono" }, row.cardId),
      isHit
        ? React.createElement(
            "span",
            { className: "px-2 py-0.5 rounded bg-green-100 text-green-800" },
            "该中的卡 ✓",
          )
        : null,
      React.createElement("span", { className: "ml-auto" }, scoreBadge),
    ),
    React.createElement(
      "div",
      { className: "text-sm text-gray-800" },
      row.text,
    ),
    reasonNode,
  );
};