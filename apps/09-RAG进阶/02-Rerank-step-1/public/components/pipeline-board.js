/**
 * 职责：两阶段左右并排。每栏一张卡一行，不做成密密麻麻对照表。
 */
(function () {
  const DemoUI = (window.DemoUI = window.DemoUI || {});

  function RecallCard(props) {
    const row = props.row;
    return (
      <article className="border border-gray-300 rounded p-4 bg-white space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-2xl font-semibold text-gray-900">召回第 {row.recallRank} 名</span>
          <span className="text-xs text-gray-500">粗召回分（coarseScore）{row.coarseScore}</span>
        </div>
        <div className="text-sm font-semibold">{row.chunk.title}</div>
        <p className="text-sm text-gray-700 leading-relaxed">{row.chunk.text}</p>
        <p className="text-xs text-gray-500">
          命中的热词（hits）：{row.hits.length ? row.hits.join("、") : "无"}
        </p>
      </article>
    );
  }

  function RerankCard(props) {
    const row = props.row;
    const lifted = row.rerankRank < row.recallRank;
    return (
      <article
        className={
          "border rounded p-4 space-y-2 " +
          (row.rerankRank === 1 ? "border-green-400 bg-green-50" : "border-gray-300 bg-white")
        }
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-2xl font-semibold text-gray-900">精排第 {row.rerankRank} 名</span>
          <span className="text-xs text-gray-500">精排分（rerankScore）{row.rerankScore}</span>
        </div>
        <div className="text-sm font-semibold">{row.chunk.title}</div>
        <p className="text-sm text-gray-700 leading-relaxed">{row.chunk.text}</p>
        <p className="text-xs text-gray-600">
          同一条切块：召回第 {row.recallRank} 名 → 精排第 {row.rerankRank} 名
          {lifted ? " · 被抬上来了" : ""}
        </p>
        {row.reason ? <p className="text-xs text-gray-500">模型理由：{row.reason}</p> : null}
      </article>
    );
  }

  DemoUI.PipelineBoard = function PipelineBoard(props) {
    const recall = props.recall;
    const rerank = props.rerank;
    const request = props.request;
    const error = props.error;

    if (!recall && !error && !request) {
      return (
        <section className="bg-white shadow rounded p-4 min-h-[200px]">
          <p className="text-sm text-gray-500">
            还没有跑流程。先看上面的服务端切块，再点第一步。
          </p>
        </section>
      );
    }

    return (
      <section className="bg-white shadow rounded p-4 space-y-4 min-h-[200px]">
        {request ? (
          <div className="bg-gray-50 text-gray-700 rounded p-3 text-xs space-y-1">
            <div>请求参数</div>
            <pre className="whitespace-pre-wrap max-h-32 overflow-auto">{JSON.stringify(request, null, 2)}</pre>
          </div>
        ) : null}

        {error ? (
          <div className="border border-red-300 bg-red-50 text-red-800 rounded p-3 text-sm">
            {error}
          </div>
        ) : null}

        {recall ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="space-y-3 min-w-0">
              <h3 className="text-sm font-semibold">
                阶段 1 · 粗召回（Retrieval）· 桌上这 {recall.rows.length} 条
              </h3>
              <p className="text-xs text-gray-500">
                没上桌的切块：
                {recall.leftOut.length
                  ? recall.leftOut.map(function (item) { return item.title; }).join("、")
                  : "无"}
                。精排看不见它们。
              </p>
              <div className="space-y-3">
                {recall.rows.map(function (row) {
                  return <RecallCard key={row.chunk.id} row={row} />;
                })}
              </div>
            </div>

            <div className="space-y-3 min-w-0 md:border-l md:pl-6 border-gray-200">
              {rerank ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">阶段 2 · 精排（Rerank）· 新顺序</h3>
                  <p className="text-xs text-gray-500">
                    生成阶段通常只吃最前面几条。看「未拆封超期」有没有从召回较后的名次被抬到前面。
                  </p>
                  <div className="space-y-3">
                    {rerank.rows.map(function (row) {
                      return <RerankCard key={row.chunk.id} row={row} />;
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">阶段 2 · 精排（Rerank）</h3>
                  <p className="text-xs text-gray-500">
                    还没精排。点第二步，只给左边这些切块打分。
                  </p>
                  <div className="border border-dashed border-gray-300 rounded p-4 text-sm text-gray-500 min-h-[160px]">
                    桌上已有候选。精排不会再搜整库，只会改左边这些切块的顺序。
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>
    );
  };
})();
