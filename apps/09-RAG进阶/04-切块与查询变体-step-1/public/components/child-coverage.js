/**
 * 职责：把「所有 6 个子块的余弦相似度 + 排名 + 是否入选 topK」完整打到页面，
 *       让学习者一眼看见「检索这一步到底选中了谁、为什么」。
 * 数据流：props.children（allChildren）→ 排序按 rank 升序 → 高对比绿底/灰底区分。
 * 配套：左侧 HitAndFeed 仍只看 topK 命中子块；本卡是「完整覆盖视图」。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.ChildCoverage = function ChildCoverage(props) {
    const items = props.children || [];
    if (items.length === 0) {
      return (
        <p className="text-sm text-gray-500">还没有子块覆盖。点「检索并生成」之后，这里会列出全部 6 个子块的余弦相似度与排名。</p>
      );
    }
    const hitCount = items.filter(function (item) { return item.isHit; }).length;
    return (
      <div
        id="child-coverage"
        className="border border-gray-300 bg-white rounded p-3 space-y-2"
      >
        <p className="text-sm font-semibold">
          子块覆盖（Child Coverage）· 全部 {items.length} 条打分 · {hitCount} 条入选 topK
        </p>
        <p className="text-xs text-gray-600">
          「<span className="font-medium">找</span>」这一步 = 把问句和每个子块正文都变成向量（Embedding），
          用余弦相似度（Cosine Similarity）算相似度，按分数从高到低排。
          <span className="text-green-700 font-medium">绿底 = 入选 topK</span>，
          <span className="text-gray-500">灰底 = 未入选 topK（相似度低）</span>。
          父块（ PARENTS，3 条）<span className="font-medium">不进检索打分</span>——命中后按 parentId 取父块原文。
        </p>
        <ol className="space-y-2 list-decimal pl-5">
          {items.map(function (item) {
            const cls = item.isHit
              ? "border-green-300 bg-green-50"
              : "border-gray-200 bg-gray-50";
            const tag = item.isHit ? (
              <span className="text-green-700 font-mono">✓ 入选 topK</span>
            ) : (
              <span className="text-gray-500 font-mono">· 未入选 topK</span>
            );
            return (
              <li
                key={item.id}
                className={"rounded p-2 border text-xs space-y-1 " + cls}
              >
                <p className="font-mono">
                  第 {item.rank} 名 · 余弦相似度 {item.score.toFixed(4)} · id={item.id} · 父亲 parentId={item.parentId}
                </p>
                <p className="font-medium">{item.title}</p>
                <pre className="whitespace-pre-wrap text-gray-700">{item.text}</pre>
                <p>{tag}</p>
              </li>
            );
          })}
        </ol>
      </div>
    );
  };
})();