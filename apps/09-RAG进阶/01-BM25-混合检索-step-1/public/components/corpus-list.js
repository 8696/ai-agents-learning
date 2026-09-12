/**
 * 职责：把 6 条语料卡 + 各自的「向量前 8 维」 + 「向量长度（L2 norm）」画成一张表。
 *       让学习者一眼看见「向量 = 一长串小数」，并能比较「同方向不同长度的卡」norm 差多少。
 * 挂载：window.DemoUI.CorpusList
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.CorpusList = function CorpusList({ corpus }) {
  if (!corpus) {
    return React.createElement(
      "div",
      { className: "text-xs text-gray-400" },
      "（语料向量预览还没拿到——点一次向量侧按钮先触发嵌入）",
    );
  }
  const cachedBadge = corpus.cached
    ? React.createElement(
        "span",
        { className: "px-2 py-0.5 rounded bg-green-100 text-green-800 ml-2" },
        "已嵌入（cached=true）",
      )
    : React.createElement(
        "span",
        { className: "px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 ml-2" },
        "未嵌入（cached=false）",
      );
  return React.createElement(
    "div",
    { className: "space-y-2" },
    React.createElement(
      "div",
      { className: "flex flex-wrap items-center gap-2" },
      React.createElement(
        "div",
        { className: "text-sm font-semibold text-gray-700" },
        "向量库一览（6 条语料卡 · 内存中，重启即丢）",
      ),
      cachedBadge,
      React.createElement(
        "span",
        { className: "text-xs text-gray-500" },
        "嵌入模型（embeddingModel）：",
      ),
      React.createElement(
        "span",
        { className: "text-xs font-mono" },
        corpus.embeddingModel ?? "—",
      ),
    ),
    React.createElement(
      "table",
      { className: "w-full text-xs border-collapse" },
      React.createElement(
        "thead",
        null,
        React.createElement(
          "tr",
          { className: "bg-gray-100 text-left" },
          React.createElement("th", { className: "border p-1" }, "id"),
          React.createElement("th", { className: "border p-1" }, "文本（前 24 字）"),
          React.createElement(
            "th",
            { className: "border p-1" },
            "向量前 8 维（vector preview）",
          ),
          React.createElement(
            "th",
            { className: "border p-1" },
            "向量长度（L2 norm）",
          ),
        ),
      ),
      React.createElement(
        "tbody",
        null,
        corpus.cards.map((card) =>
          React.createElement(
            "tr",
            { key: card.id, className: "even:bg-gray-50" },
            React.createElement(
              "td",
              { className: "border p-1 font-mono" },
              card.id,
            ),
            React.createElement(
              "td",
              { className: "border p-1" },
              card.text.length > 24 ? card.text.slice(0, 24) + "…" : card.text,
            ),
            React.createElement(
              "td",
              { className: "border p-1 font-mono" },
              card.vectorPreview.length === 0
                ? "（还没嵌入）"
                : card.vectorPreview.map((n) => n.toFixed(3)).join(", "),
            ),
            React.createElement(
              "td",
              { className: "border p-1 font-mono" },
              card.norm === 0 ? "—" : card.norm.toFixed(3),
            ),
          ),
        ),
      ),
    ),
    React.createElement(
      "div",
      { className: "text-xs text-gray-500" },
      "怎么读这表：每行就是一张「卡」；「向量前 8 维」是嵌入模型把这条文本压成的 1024 维里挑前 8 维给你看（完整向量算余弦时用全部维度）；「L2 norm」= 向量长度——同方向不同长度的卡 norm 差很大（余弦会拉齐方向，长度影响被压掉）。",
    ),
  );
};