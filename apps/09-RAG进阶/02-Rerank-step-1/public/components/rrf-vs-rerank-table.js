/**
 * 职责：「融合 ≠ 精排加强对照」页的对照表组件：
 *   按粗召回 RRF 名次排，每一条同时显示 RRF 分 + 精排分 + 名次变化。
 *   高亮名次有变化的条目。
 *
 * 挂载：window.DemoUI.RrfVsRerankTable
 *
 * 入参：
 *   recall    = RrfSearchResult 形状（含 rows: RrfRow[]，按 RRF 名次排好）
 *   rerank    = RerankResult 形状（含 rows: RerankRow[]，含 rrfScore 透传）
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.RrfVsRerankTable = function RrfVsRerankTable({ recall, rerank }) {
  if (!recall || !rerank) {
    return React.createElement("div", { className: "text-xs text-gray-400" }, "（还没跑对照）");
  }

  function fmt(num, digits) {
    if (num === 0) return "—";
    return Number(num).toFixed(digits ?? 4);
  }

  // 拿精排榜里 cardId -> row 的索引
  const rerankByCard = new Map(rerank.rows.map((r) => [r.cardId, r]));

  // 按 RRF 名次排序（粗召回榜已按 RRF 排好，直接遍历）
  const rows = recall.rows.map((rrfRow) => {
    const rrfRank = rrfRow.rank;
    const rerankRow = rerankByCard.get(rrfRow.cardId);
    const rerankRank = rerankRow ? rerankRow.rank : null;
    const rerankScore = rerankRow ? rerankRow.rerankScore : null;
    const rankDelta = rerankRank !== null ? rrfRank - rerankRank : null;
    return {
      cardId: rrfRow.cardId,
      text: rrfRow.text,
      rrfScore: rrfRow.rrfScore,
      rrfRank,
      rerankRank,
      rerankScore,
      rankDelta,
    };
  });

  function deltaBadge(delta) {
    if (delta === null) return React.createElement("span", { className: "text-xs px-1 rounded bg-gray-100 text-gray-600" }, "不在精排榜");
    if (delta > 0) return React.createElement("span", { className: "text-xs px-1 rounded bg-green-100 text-green-800" }, "↑" + delta);
    if (delta < 0) return React.createElement("span", { className: "text-xs px-1 rounded bg-red-100 text-red-800" }, "↓" + (-delta));
    return React.createElement("span", { className: "text-xs px-1 rounded bg-gray-100 text-gray-600" }, "→0");
  }

  function Row({ row }) {
    const moved = row.rankDelta !== null && row.rankDelta !== 0;
    const borderCls = moved ? "border-yellow-300 bg-yellow-50" : "border-gray-200 bg-white";
    return React.createElement(
      "div",
      { className: "border rounded p-2 space-y-1 " + borderCls },
      React.createElement(
        "div",
        { className: "flex flex-wrap items-center gap-2 text-xs" },
        React.createElement("span", { className: "font-mono font-semibold text-gray-800" }, "RRF #" + row.rrfRank),
        React.createElement("span", { className: "font-mono" }, row.cardId),
        React.createElement("span", { className: "font-mono text-blue-700" }, "RRF分 " + fmt(row.rrfScore, 4)),
        React.createElement("span", { className: "font-mono text-gray-400" }, "→"),
        React.createElement("span", { className: "font-mono font-semibold text-gray-800" }, row.rerankRank !== null ? "精排 #" + row.rerankRank : "—"),
        React.createElement("span", { className: "font-mono text-purple-700" }, row.rerankScore !== null ? "精排分 " + fmt(row.rerankScore, 3) : "—"),
        deltaBadge(row.rankDelta),
      ),
      React.createElement(
        "pre",
        { className: "text-xs whitespace-pre-wrap bg-white border border-gray-200 rounded p-2 max-h-16 overflow-auto text-gray-700" },
        row.text,
      ),
    );
  }

  // 名次变化的条目
  const moved = rows.filter((r) => r.rankDelta !== null && r.rankDelta !== 0);

  return React.createElement(
    "div",
    { className: "space-y-3" },
    React.createElement(
      "div",
      { className: "text-sm text-gray-700" },
      "按粗召回 RRF 名次排序 · 每行同时显示 RRF 分（蓝色） + 精排分（紫色） · 黄框 = 名次变了 · ⬆ = 升 · ⬇ = 降 · →0 = 不动",
    ),
    React.createElement(
      "div",
      { className: "space-y-2" },
      rows.map(function (r) {
        return React.createElement(Row, { key: r.cardId, row: r });
      }),
    ),
    moved.length > 0
      ? React.createElement(
          "div",
          { className: "bg-yellow-50 border border-yellow-300 rounded p-3 text-sm space-y-1" },
          React.createElement("div", { className: "font-semibold text-yellow-900" },
            "⚠ 名次有变化的条目（" + moved.length + " 张）："
          ),
          moved.map(function (r) {
            return React.createElement(
              "div",
              { key: r.cardId, className: "text-xs text-gray-700 font-mono" },
              r.cardId + "：RRF #" + r.rrfRank + " (RRF分 " + fmt(r.rrfScore, 4) + ") → 精排 #" + r.rerankRank + " (精排分 " + fmt(r.rerankScore, 3) + ")",
            );
          }),
          React.createElement("div", { className: "text-xs text-gray-700 mt-1" },
            React.createElement("b", null, "教学点："),
            " RRF 是按名次投票的合成粗名单（不同通道对每一条的名次相加），精排是大模型读问句和正文之后单独打的相关分——",
            React.createElement("b", null, "两条通道看的是不同的事"),
            "，所以名次会动。这正是变体 7「融合名次 ≠ 精排名次」。",
          ),
        )
      : React.createElement(
          "div",
          { className: "bg-green-50 border border-green-300 rounded p-3 text-sm" },
          React.createElement("div", { className: "font-semibold text-green-800" },
            "✅ 名次全部一致 · 本批候选里 RRF 和精排顺序相同"
          ),
          React.createElement("div", { className: "text-xs text-gray-700 mt-1" },
            "本问句里粗召回前 K 条已经够好；如果经常这样，关掉精排是合理的（变体 12）。",
          ),
        ),
  );
};
