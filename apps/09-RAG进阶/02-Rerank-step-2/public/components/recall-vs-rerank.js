/**
 * 职责：把"粗召回榜"和"精排榜"并排展示 + 显示名次跳动 + 把条目正文一起露出来。
 *
 * 挂载：window.DemoUI.RecallVsRerank
 *
 * 入参：recall = RrfSearchResult 形状（含 rows: RrfRow[]，每行 .text = 条目正文）
 *       rerank = RerankResult 形状（含 rows: RerankRow[]，每行 .text = 条目正文）
 * 出参：两块对照榜 + 名次跳动小条
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.RecallVsRerank = function RecallVsRerank({ recall, rerank }) {
  if (!recall) {
    return React.createElement("div", { className: "text-xs text-gray-400" }, "（还没跑粗召回）");
  }

  function fmt(n, digits) {
    if (n === 0) return "—";
    return Number(n).toFixed(digits ?? 4);
  }

  function sourceBadge(s) {
    if (s === "both") return React.createElement("span", { className: "text-xs px-1 rounded bg-green-100 text-green-800" }, "双通道");
    if (s === "vector") return React.createElement("span", { className: "text-xs px-1 rounded bg-blue-100 text-blue-800" }, "仅向量");
    return React.createElement("span", { className: "text-xs px-1 rounded bg-yellow-100 text-yellow-800" }, "仅 BM25");
  }

  function deltaBadge(prev, cur) {
    if (!prev) return null;
    const delta = prev - cur;
    if (delta > 0) return React.createElement("span", { className: "text-xs px-1 rounded bg-green-100 text-green-800" }, "↑" + delta);
    if (delta < 0) return React.createElement("span", { className: "text-xs px-1 rounded bg-red-100 text-red-800" }, "↓" + (-delta));
    return React.createElement("span", { className: "text-xs px-1 rounded bg-gray-100 text-gray-600" }, "→0");
  }

  // 一行条目块：header 行（rank/id/分数/徽标） + body 行（正文 <pre>）
  function RecallRow(r) {
    return React.createElement(
      "div",
      { className: "border border-gray-200 rounded p-2 space-y-1 bg-white" },
      React.createElement(
        "div",
        { className: "flex flex-wrap items-center gap-2 text-xs" },
        React.createElement("span", { className: "font-mono font-semibold text-gray-800" }, "#" + r.rank),
        React.createElement("span", { className: "font-mono" }, r.cardId),
        React.createElement("span", { className: "font-mono text-gray-500" }, "RRF " + fmt(r.rrfScore, 4)),
        React.createElement("span", { className: "font-mono text-gray-500" }, "向量 #" + (r.vectorRank > 0 ? r.vectorRank : "—")),
        React.createElement("span", { className: "font-mono text-gray-500" }, "BM25 #" + (r.bm25Rank > 0 ? r.bm25Rank : "—")),
        sourceBadge(r.source),
      ),
      React.createElement(
        "pre",
        { className: "text-xs whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2 max-h-24 overflow-auto text-gray-700" },
        r.text,
      ),
    );
  }

  function RerankRow(r) {
    return React.createElement(
      "div",
      { className: "border border-gray-200 rounded p-2 space-y-1 bg-white" },
      React.createElement(
        "div",
        { className: "flex flex-wrap items-center gap-2 text-xs" },
        React.createElement("span", { className: "font-mono font-semibold text-gray-800" }, "#" + r.rank),
        React.createElement("span", { className: "font-mono" }, r.cardId),
        React.createElement("span", { className: "font-mono text-gray-500" }, "精排分 " + fmt(r.rerankScore, 3)),
        React.createElement("span", { className: "font-mono text-gray-500" }, "粗召回原 #" + r.previousRank),
        deltaBadge(r.previousRank, r.rank),
      ),
      React.createElement(
        "pre",
        { className: "text-xs whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2 max-h-24 overflow-auto text-gray-700" },
        r.text,
      ),
    );
  }

  // 左侧表
  const recallBlock = React.createElement(
    "div",
    { className: "bg-white border border-gray-300 rounded p-3 space-y-2" },
    React.createElement("div", { className: "text-sm font-semibold text-gray-800" },
      "① 粗召回榜（向量 + BM25 + RRF · 余弦 / BM25 不同尺子）"
    ),
    React.createElement(
      "div",
      { className: "space-y-2" },
      recall.rows.map(function (r, i) {
        return React.createElement(RecallRow, Object.assign({ key: r.cardId }, r, { rank: i + 1 }));
      }),
    ),
  );

  // 右侧表
  const rerankBlock = rerank
    ? React.createElement(
        "div",
        { className: "bg-white border border-gray-300 rounded p-3 space-y-2" },
        React.createElement("div", { className: "text-sm font-semibold text-gray-800" },
          "② 精排榜（大模型按「问句 + 文档」成对打分 · 0~1）"
        ),
        React.createElement(
          "div",
          { className: "space-y-2" },
          rerank.rows.map(function (r) {
            return React.createElement(RerankRow, Object.assign({ key: r.cardId }, r));
          }),
        ),
        React.createElement(
          "div",
          { className: "text-xs text-gray-500 mt-1" },
          "模型原话返回的分数数组：",
          React.createElement("span", { className: "font-mono" },
            "[" + rerank.rawScores.map(function (s) { return s.toFixed(2); }).join(", ") + "]"
          ),
        ),
        React.createElement(
          "div",
          { className: "text-xs text-gray-500" },
          "总耗时（含模型调用）",
          React.createElement("span", { className: "font-mono ml-1" }, rerank.elapsedMs + " ms"),
        ),
      )
    : React.createElement(
        "div",
        { className: "bg-white border border-dashed border-gray-300 rounded p-3 text-xs text-gray-500" },
        "还没点「② 继续精排」。点上面那个按钮 → 第二次发请求 → 这边会出现精排分和名次跳动。",
      );

  return React.createElement(
    "div",
    { className: "space-y-3" },
    React.createElement(
      "div",
      { className: "text-sm text-gray-700" },
      "同一问句：",
      React.createElement("span", { className: "font-mono ml-1" }, recall.query),
    ),
    React.createElement(
      "div",
      { className: "grid grid-cols-1 md:grid-cols-2 gap-3" },
      recallBlock,
      rerankBlock,
    ),
    rerank
      ? React.createElement(
          "div",
          { className: "bg-yellow-50 border border-yellow-300 rounded p-2 text-xs text-gray-700" },
          React.createElement("b", null, "教学点："),
          " 名次差 = 粗召回原 rank − 精排新 rank；正值 = 升、负值 = 降；同一条条目的余弦 / BM25 分数没动，但精排读了问句和正文之后名次会跳——这就是两阶段分工。",
        )
      : null,
  );
};