/**
 * 职责：「精排 ON / OFF 对照」页的两栏对照组件：
 *   ① 精排 ON（调大模型按"问句+文档"成对打分）—— rows 按精排分重排
 *   ② 精排 OFF（直接按粗召回 RRF 序截 K） —— rows 同粗召回原序
 *
 * 挂载：window.DemoUI.RerankOnOffTable
 *
 * 入参：
 *   recallOn    = RerankResult 形状（精排 ON 的结果，可能为 null）
 *   recallOff   = RerankResult 形状（精排 OFF 的结果，可能为 null）
 *   candidates  = RrfRow[]（粗召回前 N 条，作为同序对照基准）
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.RerankOnOffTable = function RerankOnOffTable({ recallOn, recallOff, candidates }) {
  if (!recallOn && !recallOff) {
    return React.createElement("div", { className: "text-xs text-gray-400" }, "（还没跑对照）");
  }

  function fmt(num, digits) {
    if (num === 0) return "—";
    return Number(num).toFixed(digits ?? 4);
  }

  function ResultRow({ r, isFromRecall }) {
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
        isFromRecall ? React.createElement("span", { className: "text-xs px-1 rounded bg-gray-100 text-gray-700" }, "同粗召回序") : null,
      ),
      React.createElement(
        "pre",
        { className: "text-xs whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2 max-h-16 overflow-auto text-gray-700" },
        r.text,
      ),
    );
  }

  function ResultBlock({ label, colorCls, result, candidatesCount }) {
    if (!result) {
      return React.createElement(
        "div",
        { className: "border border-dashed border-gray-300 rounded p-3 text-xs text-gray-500" },
        "还没跑「" + label + "」。点上面按钮 → 这里出现对照榜。",
      );
    }
    const headerCls = "text-sm font-semibold " + colorCls;
    return React.createElement(
      "div",
      { className: "space-y-2" },
      React.createElement("div", { className: headerCls }, label),
      React.createElement(
        "div",
        { className: "space-y-2" },
        result.rows.map(function (r) {
          // 精排 OFF 时，每行的 previousRank 应该等于 rank（顺序未变）；标记「同粗召回序」
          const isFromRecall = !recallOn || (r.rank === r.previousRank);
          return React.createElement(ResultRow, { key: r.cardId, r: r, isFromRecall: isFromRecall });
        }),
      ),
      React.createElement(
        "div",
        { className: "text-xs text-gray-500 mt-1" },
        "分数数组：",
        React.createElement("span", { className: "font-mono ml-1" },
          "[" + result.rawScores.map(function (s) { return s.toFixed(2); }).join(", ") + "]"
        ),
      ),
      React.createElement(
        "div",
        { className: "text-xs text-gray-500" },
        "总耗时",
        React.createElement("span", { className: "font-mono ml-1" }, result.elapsedMs + " ms"),
        recallOff && label.indexOf("OFF") >= 0
          ? React.createElement("span", { className: "ml-2 text-green-700" }, "（不调模型，本地截 K）")
          : null,
      ),
    );
  }

  // 对照判断：两边的 rows 顺序是否一致 + 列出名次变了的条目
  const sameOrder = (() => {
    if (!recallOn || !recallOff) return null;
    if (recallOn.rows.length !== recallOff.rows.length) return false;
    for (let i = 0; i < recallOn.rows.length; i++) {
      if (recallOn.rows[i].cardId !== recallOff.rows[i].cardId) return false;
    }
    return true;
  })();

  // 列出 ON 名次和 OFF 名次不同的条目（用 cardId 找 OFF 的 rank）
  const rankDiffs = (() => {
    if (!recallOn || !recallOff) return [];
    const offByCard = new Map(recallOff.rows.map((r) => [r.cardId, r.rank]));
    const diffs = [];
    for (const onRow of recallOn.rows) {
      const offRank = offByCard.get(onRow.cardId);
      if (offRank !== undefined && offRank !== onRow.rank) {
        diffs.push({ cardId: onRow.cardId, onRank: onRow.rank, offRank: offRank });
      }
    }
    return diffs;
  })();

  const judgmentBlock = (recallOn && recallOff)
    ? React.createElement(
        "div",
        { className: (sameOrder ? "bg-green-50 border-green-300" : "bg-yellow-50 border-yellow-300") + " border rounded p-3 text-sm space-y-1" },
        React.createElement("div", { className: "font-semibold " + (sameOrder ? "text-green-800" : "text-yellow-900") },
          sameOrder
            ? "✅ ON 与 OFF 顺序一致 · 本问句精排没动名次"
            : "⚠ ON 与 OFF 名次有差异 · 精排动了名次（见下方「名次变化」列表）"
        ),
        React.createElement("div", { className: "text-xs text-gray-700" },
          sameOrder
            ? "本批候选里大模型打分后顺序没变。可能是粗召回前几名已经够好，或精排器在这批候选上没差异。如果经常出现这种情形，关掉精排省时间和钱是合理的（变体 12）。"
            : "本批候选里大模型打分后顺序变了。要不要关掉精排，看「名次变化是否带来答案正确率提升」——这是评测集做的事，不是只看一两次结果。"
        ),
        !sameOrder && rankDiffs.length > 0
          ? React.createElement(
              "div",
              { className: "text-xs text-gray-700 mt-1" },
              React.createElement("b", null, "名次变化："),
              rankDiffs.map(function (d, i) {
                return React.createElement(
                  "span",
                  { key: d.cardId, className: "font-mono ml-2" },
                  d.cardId + ": OFF#" + d.offRank + " → ON#" + d.onRank,
                );
              }),
            )
          : null,
        React.createElement("div", { className: "text-xs text-gray-700" },
          React.createElement("b", null, "耗时差："),
          " ON " + recallOn.elapsedMs + " ms · OFF " + recallOff.elapsedMs + " ms · 省 " + (recallOn.elapsedMs - recallOff.elapsedMs) + " ms（一次精排调用）",
        ),
      )
    : null;

  return React.createElement(
    "div",
    { className: "space-y-3" },
    React.createElement(
      "div",
      { className: "text-sm text-gray-700" },
      "粗召回前 " + (candidates?.length ?? 0) + " 条 · 候选同 · 精排 ON（左）= 调大模型打分 · 精排 OFF（右）= 直接截 K 不调模型",
    ),
    React.createElement(
      "div",
      { className: "grid grid-cols-1 md:grid-cols-2 gap-3" },
      React.createElement("div", { className: "bg-white border border-blue-300 rounded p-3 space-y-2" },
        React.createElement(ResultBlock, { label: "① 精排 ON（调大模型打分）", colorCls: "text-blue-800", result: recallOn })
      ),
      React.createElement("div", { className: "bg-white border border-gray-300 rounded p-3 space-y-2" },
        React.createElement(ResultBlock, { label: "② 精排 OFF（直接截 K，不调模型）", colorCls: "text-gray-800", result: recallOff })
      ),
    ),
    judgmentBlock,
  );
};
