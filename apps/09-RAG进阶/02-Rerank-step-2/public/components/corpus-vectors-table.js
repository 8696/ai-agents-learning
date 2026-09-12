/**
 * 职责：把语料向量缓存的可读部分（前 8 维 + L2 范数）画出来 —— 带上正文一起，
 *       让学习者能「这段文字 → 这串浮点」一对一对得上。
 *
 * 挂载：window.DemoUI.CorpusVectorsTable
 *
 * 入参：{ cached, embeddingModel, cards: [{id, text, vectorPreview, norm}] }
 *   cached=false：缓存还没建（还没跑过 searchByVector），前端按"先跑一次粗召回"提示
 *   cached=true ：每一条一个小块（正文 + 前 8 维 + 范数）
 */
window.DemoUI = window.DemoUI || {};

window.DemoUI.CorpusVectorsTable = function CorpusVectorsTable({ data }) {
  if (!data) {
    return React.createElement("div", { className: "text-xs text-gray-400" }, "（还没拉向量）");
  }
  if (!data.cached) {
    return React.createElement(
      "div",
      { className: "bg-yellow-50 border border-yellow-300 rounded p-3 text-xs text-gray-700" },
      "向量还没嵌入。先点上面「① 跑粗召回」建一次缓存（每一条跑一次嵌入模型），再点「查看语料向量」就能看到浮点数。",
    );
  }

  function fmtVec(vs) {
    if (!vs || vs.length === 0) return "—";
    return vs.map(function (n) { return Number(n).toFixed(4); }).join(" · ");
  }

  return React.createElement(
    "div",
    { className: "space-y-3" },
    React.createElement(
      "div",
      { className: "text-sm font-semibold text-gray-800 flex items-center gap-2" },
      React.createElement("span", null, "语料向量缓存（正文 → 前 8 维浮点 + 范数）"),
      React.createElement("span", { className: "text-xs text-gray-500 font-mono" }, "嵌入模型：" + data.embeddingModel),
    ),
    React.createElement(
      "div",
      { className: "text-xs text-gray-600" },
      "每一条一行：上方是条目正文（实际送进嵌入模型的全文），下方是它对应的前 8 维浮点 + L2 范数。完整维度回页面会爆（动辄上千），所以只看前 8 维当样子。",
    ),
    React.createElement(
      "div",
      { className: "grid grid-cols-1 gap-2" },
      data.cards.map(function (c) {
        return React.createElement(
          "div",
          { key: c.id, className: "border border-gray-300 rounded p-3 space-y-2 bg-white" },
          // 标题行：cardId + 范数
          React.createElement(
            "div",
            { className: "flex items-center justify-between gap-2" },
            React.createElement("span", { className: "font-mono font-semibold text-sm text-gray-800" }, c.id),
            React.createElement("span", { className: "text-xs text-gray-500 font-mono" }, "范数 (L2) " + c.norm.toFixed(4)),
          ),
          // 正文：实际送进嵌入模型的全文
          React.createElement(
            "pre",
            { className: "text-xs whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2 max-h-24 overflow-auto text-gray-700" },
            c.text,
          ),
          // 向量前 8 维
          React.createElement(
            "div",
            { className: "text-xs text-gray-600" },
            React.createElement("span", { className: "text-gray-500 mr-1" }, "前 8 维:"),
            React.createElement("span", { className: "font-mono" }, fmtVec(c.vectorPreview)),
          ),
        );
      }),
    ),
  );
};