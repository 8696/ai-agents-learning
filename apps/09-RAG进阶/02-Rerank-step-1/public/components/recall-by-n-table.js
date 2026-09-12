/**
 * 职责：「N 可调对照」页的三栏对照组件：
 *   ① 完整粗召回榜（含候选 N 内 / 外徽标）
 *   ② 精排榜（含精排分 + previousRank）
 *   ③ B 是否在最终 K 的红/绿判断提示
 *
 * 挂载：window.DemoUI.RecallByNTable
 *
 * 入参：
 *   recall    = RrfSearchResult 形状
 *   rerank    = RerankResult 形状（可能为 null —— 没点「② 跑精排」时）
 *   n         = 候选 N（输入框当前值）
 *   targetId  = 目标条目 id（chunk id）（默认 "policy-B"）
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.RecallByNTable = function RecallByNTable({ recall, rerank, n, targetId }) {
  if (!recall) {
    return React.createElement("div", { className: "text-xs text-gray-400" }, "（还没跑粗召回）");
  }

  function fmt(num, digits) {
    if (num === 0) return "—";
    return Number(num).toFixed(digits ?? 4);
  }

  function RecallRow({ r, rank, inCandidate }) {
    const isTarget = r.cardId === targetId;
    const borderCls = inCandidate
      ? "border-green-300"
      : "border-red-300 bg-red-50";
    const tag = inCandidate
      ? React.createElement("span", { className: "text-xs px-1 rounded bg-green-100 text-green-800" }, "候选内 #" + rank)
      : React.createElement("span", { className: "text-xs px-1 rounded bg-red-100 text-red-800" }, "候选外（融合榜 #" + rank + "）");
    return React.createElement(
      "div",
      { className: "border rounded p-2 space-y-1 " + borderCls + (isTarget ? " ring-2 ring-yellow-400" : "") },
      React.createElement(
        "div",
        { className: "flex flex-wrap items-center gap-2 text-xs" },
        React.createElement("span", { className: "font-mono font-semibold text-gray-800" }, "#" + rank),
        React.createElement("span", { className: "font-mono" + (isTarget ? " font-bold text-yellow-700" : "") }, r.cardId + (isTarget ? " ⭐" : "")),
        React.createElement("span", { className: "font-mono text-gray-500" }, "RRF " + fmt(r.rrfScore, 4)),
        React.createElement("span", { className: "font-mono text-gray-500" }, "向量 #" + (r.vectorRank > 0 ? r.vectorRank : "—")),
        React.createElement("span", { className: "font-mono text-gray-500" }, "BM25 #" + (r.bm25Rank > 0 ? r.bm25Rank : "—")),
        tag,
      ),
      React.createElement(
        "pre",
        { className: "text-xs whitespace-pre-wrap bg-white border border-gray-200 rounded p-2 max-h-20 overflow-auto text-gray-700" },
        r.text,
      ),
    );
  }

  function RerankRow({ r }) {
    const isTarget = r.cardId === targetId;
    return React.createElement(
      "div",
      { className: "border border-gray-200 rounded p-2 space-y-1 bg-white" + (isTarget ? " ring-2 ring-yellow-400" : "") },
      React.createElement(
        "div",
        { className: "flex flex-wrap items-center gap-2 text-xs" },
        React.createElement("span", { className: "font-mono font-semibold text-gray-800" }, "#" + r.rank),
        React.createElement("span", { className: "font-mono" + (isTarget ? " font-bold text-yellow-700" : "") }, r.cardId + (isTarget ? " ⭐" : "")),
        React.createElement("span", { className: "font-mono text-gray-500" }, "精排分 " + fmt(r.rerankScore, 3)),
        React.createElement("span", { className: "font-mono text-gray-500" }, "粗召回原 #" + r.previousRank),
      ),
      React.createElement(
        "pre",
        { className: "text-xs whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2 max-h-20 overflow-auto text-gray-700" },
        r.text,
      ),
    );
  }

  const targetInRecall = recall.rows.findIndex(r => r.cardId === targetId);
  const bInFinal = rerank ? rerank.rows.findIndex(r => r.cardId === targetId) : -1;

  // 完整粗召回榜栏
  const recallBlock = React.createElement(
    "div",
    { className: "space-y-2" },
    React.createElement(
      "div",
      { className: "text-sm text-gray-700" },
      "完整粗召回榜（" + recall.rows.length + " 张条目 · 候选 N=" + n + "） · 绿框 = 在候选内 · 红框 = 候选外（精排看不见） · ⭐ = B（" + targetId + "）",
    ),
    React.createElement(
      "div",
      { className: "space-y-2" },
      recall.rows.map(function (r, i) {
        return React.createElement(RecallRow, { key: r.cardId, r: r, rank: i + 1, inCandidate: (i + 1) <= n });
      }),
    ),
  );

  // 精排榜栏
  const rerankBlock = React.createElement(
    "div",
    { className: "space-y-2" },
    React.createElement(
      "div",
      { className: "text-sm font-semibold text-gray-800 border-t pt-3" },
      "精排榜（送进去的是粗召回前 N 条；问句字符串不变）",
    ),
    rerank
      ? React.createElement(
          "div",
          { className: "space-y-2" },
          rerank.rows.map(function (r) {
            return React.createElement(RerankRow, { key: r.cardId, r: r });
          }),
          React.createElement(
            "div",
            { className: "text-xs text-gray-500 mt-1" },
            "模型原话返回的分数数组：",
            React.createElement("span", { className: "font-mono ml-1" },
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
          { className: "border border-dashed border-gray-300 rounded p-3 text-xs text-gray-500" },
          "还没点「② 跑精排」。点上面那个按钮 → 第二次发请求 → 这里出现精排分 + B 是否在最终 K 的判断。",
        ),
  );

  // B 状态判断提示（只在 rerank 跑完后显示）
  const judgmentBlock = rerank
    ? React.createElement(
        "div",
        { className: (bInFinal === -1 ? "bg-red-50 border-red-300" : "bg-green-50 border-green-300") + " border rounded p-3 text-sm space-y-1" },
        React.createElement("div", { className: "font-semibold " + (bInFinal === -1 ? "text-red-800" : "text-green-800") },
          bInFinal === -1
            ? "❌ B 不在最终 K · 精排救不了召回漏"
            : "✅ B 在最终 K · 第 " + (bInFinal + 1) + " 名"
        ),
        React.createElement("div", { className: "text-xs text-gray-700" },
          bInFinal === -1
            ? "N=" + n + " 时 B 在候选外（融合榜第 " + (targetInRecall + 1) + " 名）。精排只能对送进去的 " + n + " 条候选打分；看不见 B 就救不回来。下一步：加大 N（如 N=30），或修第一阶段（混合检索 / 切块 / 改写）。"
            : "N=" + n + " 时 B 进候选，精排读了问句和正文后把它顶到第 " + (bInFinal + 1) + " 名。本条诉求「运输破损补发」终于喂给生成。"
        ),
      )
    : null;

  return React.createElement(
    "div",
    { className: "space-y-3" },
    recallBlock,
    rerankBlock,
    judgmentBlock,
  );
};
