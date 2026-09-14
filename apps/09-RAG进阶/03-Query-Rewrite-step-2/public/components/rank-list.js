/**
 * 职责：一份向量检索名单（cosine 相似度排序，top-K 都视为 onTable）。
 * 数据流：retrieve.ranked → 卡片。isTarget 黄边，余弦分越高越靠前。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  function RankList(props) {
    const retrieve = props.retrieve;
    if (!retrieve) {
      return <div className="text-sm text-gray-500">{props.emptyHint}</div>;
    }
    return (
      <div className="space-y-3">
        <div className="text-xs text-gray-600">
          检索用的输入（queryUsed）：<span className="font-medium text-gray-800">{retrieve.queryUsed}</span>
        </div>
        <div className="text-xs text-gray-600">
          目标切块 id={retrieve.target.id} · 余弦分（score）={retrieve.target.score.toFixed(4)} ·
          名次（rank）={retrieve.target.rank == null ? "未进 top-K" : retrieve.target.rank} ·
          是否进 top-K（onTable）={String(retrieve.target.onTable)}
        </div>
        <div className="text-sm font-medium text-green-800">top-K（按余弦相似度降序）</div>
        {retrieve.ranked.map(function (row) {
          return <RankCard key={row.id} row={row} />;
        })}
      </div>
    );
  }

  function RankCard(props) {
    const row = props.row;
    const border = row.isTarget
      ? "border-yellow-400 bg-yellow-50"
      : "border-gray-200 bg-white";
    return (
      <article className={"border rounded p-3 " + border}>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">
            第 {row.rank} 名 · {row.title}
          </span>
          <span className="text-xs text-gray-500">
            id={row.id} · 余弦分（score）={row.score.toFixed(4)}
            {row.isTarget ? " · 目标切块" : ""}
          </span>
        </div>
        <pre className="whitespace-pre-wrap text-xs text-gray-700 mt-1 max-h-24 overflow-auto">{row.text}</pre>
      </article>
    );
  }

  DemoUI.RankList = RankList;
})();