/**
 * 职责：把"神经精排榜"和"业务加权榜"并排展示 + 显示「名次变化来源」。
 *
 * 挂载：window.DemoUI.BusinessVsNeuralTable
 *
 * 入参：
 *   neural = RerankResult 形状（含 rows: RerankRow[]）
 *   business = BusinessResult 形状（含 rows: BusinessRow[]，每行带 rerankScore / businessBonus / finalScore / updatedAt / boosted）
 *
 * 出参：左 = 神经精排榜；右 = 业务加权榜；每行显示「神经分 + 业务加权分 + 综合分」与「名次变化」徽标。
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.BusinessVsNeuralTable = function BusinessVsNeuralTable({ neural, business }) {
  if (!neural) {
    return React.createElement("div", { className: "text-xs text-gray-400" }, "（还没跑神经精排）");
  }

  function fmt(n, digits) {
    if (n === 0 || n == null) return "—";
    return Number(n).toFixed(digits ?? 3);
  }

  function deltaBadge(prev, cur) {
    if (prev == null) return null;
    const delta = prev - cur;
    if (delta > 0) return React.createElement("span", { className: "text-xs px-1 rounded bg-green-100 text-green-800" }, "↑" + delta);
    if (delta < 0) return React.createElement("span", { className: "text-xs px-1 rounded bg-red-100 text-red-800" }, "↓" + (-delta));
    return React.createElement("span", { className: "text-xs px-1 rounded bg-gray-100 text-gray-600" }, "→0");
  }

  function boostedBadge(boosted) {
    if (!boosted) return null;
    return React.createElement(
      "span",
      { className: "text-xs px-1 rounded bg-purple-100 text-purple-800" },
      "业务加权",
    );
  }

  function NeuralRow(r) {
    return React.createElement(
      "div",
      { className: "border border-gray-200 rounded p-2 space-y-1 bg-white" },
      React.createElement(
        "div",
        { className: "flex flex-wrap items-center gap-2 text-xs" },
        React.createElement("span", { className: "font-mono font-semibold text-gray-800" }, "#" + r.rank),
        React.createElement("span", { className: "font-mono" }, r.cardId),
        React.createElement("span", { className: "font-mono text-gray-500" }, "神经分 " + fmt(r.rerankScore, 3)),
      ),
      React.createElement(
        "pre",
        { className: "text-xs whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2 max-h-20 overflow-auto text-gray-700" },
        r.text,
      ),
    );
  }

  function BusinessRow(r) {
    return React.createElement(
      "div",
      { className: "border border-gray-200 rounded p-2 space-y-1 bg-white" },
      React.createElement(
        "div",
        { className: "flex flex-wrap items-center gap-2 text-xs" },
        React.createElement("span", { className: "font-mono font-semibold text-gray-800" }, "#" + r.rank),
        React.createElement("span", { className: "font-mono" }, r.cardId),
        React.createElement("span", { className: "font-mono text-gray-500" }, "神经 " + fmt(r.rerankScore, 3)),
        React.createElement("span", { className: "font-mono text-purple-700" }, "+" + fmt(r.businessBonus, 2)),
        React.createElement("span", { className: "font-mono text-gray-800" }, "= " + fmt(r.finalScore, 3)),
        React.createElement("span", { className: "font-mono text-gray-500" }, "原 #" + r.previousRank),
        deltaBadge(r.previousRank, r.rank),
        boostedBadge(r.boosted),
      ),
      React.createElement(
        "pre",
        { className: "text-xs whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2 max-h-20 overflow-auto text-gray-700" },
        r.text,
      ),
      React.createElement(
        "div",
        { className: "text-xs text-gray-500 font-mono" },
        "updatedAt: " + r.updatedAt + (r.boosted ? "（命中「近 N 天」窗口）" : "（不在窗口内）"),
      ),
    );
  }

  // 左：神经精排榜
  const neuralBlock = React.createElement(
    "div",
    { className: "bg-white border border-gray-300 rounded p-3 space-y-2" },
    React.createElement("div", { className: "text-sm font-semibold text-gray-800" },
      "③ 神经精排榜（大模型按「问句 + 文档」成对打分 · 0~1）"
    ),
    React.createElement(
      "div",
      { className: "space-y-2" },
      neural.rows.map(function (r) {
        return React.createElement(NeuralRow, Object.assign({ key: r.cardId }, r));
      }),
    ),
    React.createElement(
      "div",
      { className: "text-xs text-gray-500 mt-1" },
      "模型原话返回的分数数组：",
      React.createElement("span", { className: "font-mono" },
        "[" + neural.rawScores.map(function (s) { return s.toFixed(2); }).join(", ") + "]"
      ),
    ),
  );

  // 右：业务加权榜
  const businessBlock = business
    ? React.createElement(
        "div",
        { className: "bg-white border border-gray-300 rounded p-3 space-y-2" },
        React.createElement("div", { className: "text-sm font-semibold text-gray-800" },
          "④ 业务加权榜（神经分 + 按 updatedAt 加权 · 「近 "
            + business.businessWeight.recentDays
            + " 天」+" + fmt(business.businessWeight.bonus, 2) + "）"
        ),
        React.createElement(
          "div",
          { className: "text-xs text-gray-600" },
          "权重配置：开关 ",
          React.createElement("span", { className: "font-mono" }, business.businessWeight.on ? "开" : "关"),
          " · 窗口 ",
          React.createElement("span", { className: "font-mono" }, business.businessWeight.recentDays + " 天"),
          " · bonus ",
          React.createElement("span", { className: "font-mono" }, "+" + fmt(business.businessWeight.bonus, 2)),
        ),
        React.createElement(
          "div",
          { className: "space-y-2" },
          business.rows.map(function (r) {
            return React.createElement(BusinessRow, Object.assign({ key: r.cardId }, r));
          }),
        ),
        React.createElement(
          "div",
          { className: "text-xs text-gray-500 mt-1" },
          "总耗时（纯本地）",
          React.createElement("span", { className: "font-mono ml-1" }, business.elapsedMs + " ms"),
        ),
      )
    : React.createElement(
        "div",
        { className: "bg-white border border-dashed border-gray-300 rounded p-3 text-xs text-gray-500" },
        "还没点「③ 跑业务加权」。点上面那个按钮 → 第三次发请求 → 这边会出现神经分 + 业务加权分 + 名次变化。",
      );

  return React.createElement(
    "div",
    { className: "space-y-3" },
    React.createElement(
      "div",
      { className: "text-sm text-gray-700" },
      "同一问句、同一份神经精排结果：",
      React.createElement("span", { className: "font-mono ml-1" }, neural.query),
    ),
    React.createElement(
      "div",
      { className: "grid grid-cols-1 md:grid-cols-2 gap-3" },
      neuralBlock,
      businessBlock,
    ),
    business
      ? React.createElement(
          "div",
          { className: "bg-yellow-50 border border-yellow-300 rounded p-2 text-xs text-gray-700" },
          React.createElement("b", null, "教学点："),
          business.anyRankChanged
            ? " 神经分没动，但近 "
              + business.businessWeight.recentDays
              + " 天编辑过的卡片获得了 +"
              + fmt(business.businessWeight.bonus, 2)
              + " 的业务加权，名次因此换了。这就是「业务加权 ≠ 神经精排」——名次变化的来源是规则，不是模型。"
            : " 名次没变。当前窗口/bonus 配置下，没有任何候选命中「近 "
              + business.businessWeight.recentDays
              + " 天」规则；调大窗口或换几张卡片 updatedAt 再看。",
        )
      : null,
  );
};