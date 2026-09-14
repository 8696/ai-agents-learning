/**
 * 职责：一份检索名单。进检索名单与未进检索名单分开；目标切块始终标出。
 * 数据流：retrieve.ranked → 卡片。onTable 用绿边，未进检索名单用灰边。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  function RankList(props) {
    const retrieve = props.retrieve;
    if (!retrieve) {
      return <div className="text-sm text-gray-500">{props.emptyHint}</div>;
    }
    const onTable = retrieve.ranked.filter(function (row) { return row.onTable; });
    const offTable = retrieve.ranked.filter(function (row) { return !row.onTable; });
    return (
      <div className="space-y-3">
        <div className="text-xs text-gray-600">
          检索用的问句（queryUsed）：<span className="font-medium text-gray-800">{retrieve.queryUsed}</span>
        </div>
        <div className="text-xs text-gray-600">
          拆出的检索词（terms）：{retrieve.terms.join("、") || "（无）"}
        </div>
        <div className="text-xs">
          目标切块 id={retrieve.target.id} · 是否进检索名单（onTable）={String(retrieve.target.onTable)} · 名次（rank）={retrieve.target.rank == null ? "无" : retrieve.target.rank}
        </div>
        <div className="text-sm font-medium text-green-800">进检索名单（score 大于 0）</div>
        {onTable.length === 0 ? (
          <div className="border border-red-200 bg-red-50 rounded p-2 text-xs text-red-800">
            {props.side === "rewritten"
              ? "已经用改写句检索过了，仍然 0 条进检索名单。改写可能改偏了，或库里没有对应正文。"
              : "已经用原句检索过了，不是没检索。8 个切块全是 0 分，一个都没匹配上。这就是词汇鸿沟（Lexical Gap）：意思在库里，送进去的字对不上。"}
          </div>
        ) : onTable.map(function (row) {
          return <RankCard key={row.id} row={row} />;
        })}
        <div className="text-sm font-medium text-gray-700">未进检索名单（score = 0）</div>
        {offTable.map(function (row) {
          return <RankCard key={row.id} row={row} />;
        })}
      </div>
    );
  }

  function RankCard(props) {
    const row = props.row;
    const border = row.isTarget
      ? (row.onTable ? "border-green-400 bg-green-50" : "border-red-300 bg-red-50")
      : (row.onTable ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50");
    return (
      <article className={"border rounded p-3 " + border}>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">
            {row.onTable ? ("第 " + row.rank + " 名") : "未进检索名单"} · {row.title}
          </span>
          <span className="text-xs text-gray-500">
            id={row.id} · 分（score）={row.score}
            {row.isTarget ? " · 目标切块" : ""}
          </span>
        </div>
        <pre className="whitespace-pre-wrap text-xs text-gray-700 mt-1 max-h-24 overflow-auto">{row.text}</pre>
        <div className="text-xs text-gray-500 mt-1">
          命中词（matchedTerms）：{row.matchedTerms.length ? row.matchedTerms.join("、") : "无"}
        </div>
      </article>
    );
  }

  DemoUI.RankList = RankList;
})();
