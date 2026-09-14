/**
 * 职责：展示多路查询（Multi-query Retrieval）的全流程：
 *   ① N 条检索问句变体
 *   ② 每条问句自己的命中（每路一份名单）
 *   ③ RRF 合并后的全 6 条覆盖（带 RRF 分数）
 *   ④ 同父去重 + 父块
 *   ⑤ 模型实际收到的 messages（多路材料已合并到一份）
 *   ⑥ 模型答复
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.MultiQueryPanel = function MultiQueryPanel(props) {
    const r = props.result;
    if (!r) return null;
    return (
      <div className="space-y-3">
        {/* N 条问句变体 */}
        <details
          id="multi-query-variants"
          className="border border-indigo-300 bg-indigo-50 rounded p-3"
          open
        >
          <summary className="text-sm font-semibold text-indigo-900 cursor-pointer">
            多路问句变体（Query Variants） · 模型生成 {r.queryVariants.length} 条
          </summary>
          <div className="text-xs space-y-2 mt-2">
            <p className="text-gray-700">
              用户原句（query）：<span className="font-mono">{r.query}</span>
            </p>
            <p className="text-gray-700">
              嵌入提供商：<span className="font-mono">{r.queryVariantsEmbed.provider}</span>
              · 嵌入模型：<span className="font-mono">{r.queryVariantsEmbed.model}</span>
              · 向量维度：<span className="font-mono">{r.queryVariantsEmbed.vectorDim}</span>
              · {r.queryVariants.length} 个变体算嵌入总耗时：<span className="font-mono">{r.queryVariantsEmbed.durationMs} ms</span>
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              {r.queryVariants.map(function (v, idx) {
                return (
                  <li key={idx} className="bg-white border border-indigo-200 rounded p-2 font-mono text-xs">
                    {v}
                  </li>
                );
              })}
            </ol>
            <p className="text-gray-600">
              每条变体都会在向量库上独立跑一次余弦相似度排序，下面分别展示。
            </p>
          </div>
        </details>

        {/* 每条问句的命中 */}
        <details
          id="multi-query-per-route"
          className="border border-blue-300 bg-blue-50 rounded p-3"
          open
        >
          <summary className="text-sm font-semibold text-blue-900 cursor-pointer">
            每路命中 · 每条问句各自的名单
          </summary>
          <div className="space-y-3 mt-2">
            {r.perQueryHits.map(function (route, idx) {
              return (
                <div key={idx} className="bg-white border border-blue-200 rounded p-3">
                  <p className="text-xs font-medium text-blue-900">
                    第 {idx + 1} 路 · 问句：<span className="font-mono">{route.query}</span>
                  </p>
                  <p className="text-xs text-gray-600 mt-1">topK = {r.topK} 的命中（按余弦相似度降序）：</p>
                  <ol className="list-decimal pl-5 space-y-1 mt-1">
                    {route.childHits.length === 0 ? (
                      <li className="text-xs text-gray-500">（没有命中——这条问句在向量库里没找到相似子块）</li>
                    ) : (
                      route.childHits.map(function (hit) {
                        return (
                          <li key={hit.id} className="text-xs">
                            <span className="font-mono">
                              第 {hit.rank} 名 · 余弦相似度 {hit.score.toFixed(4)} · id={hit.id} · 父 {hit.parentId}
                            </span>
                            <span className="text-gray-700"> · {hit.title}</span>
                          </li>
                        );
                      })
                    )}
                  </ol>
                </div>
              );
            })}
          </div>
        </details>

        {/* RRF 合并 */}
        <details
          id="multi-query-rrf"
          className="border border-green-300 bg-green-50 rounded p-3"
          open
        >
          <summary className="text-sm font-semibold text-green-900 cursor-pointer">
            RRF 合并（Reciprocal Rank Fusion） · 被多路都捞到的往上抬
          </summary>
          <div className="text-xs space-y-2 mt-2">
            <p className="text-gray-700">
              合并公式：rrfScore(d) = Σ 1 / (60 + rank_in_route)；k 取 60。
              被多路共同命中的切块分数累加更高。
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              {r.rrfMerged.map(function (item) {
                return (
                  <li key={item.id} className="text-xs">
                    <span className="font-mono">
                      第 {item.rank} 名 · RRF 分数 {item.score.toFixed(4)} · id={item.id} · 父 {item.parentId}
                    </span>
                    <span className="text-gray-700"> · {item.title}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </details>

        {/* 去重后的父块 */}
        <details
          id="multi-query-parents"
          className="border border-purple-300 bg-purple-50 rounded p-3"
          open
        >
          <summary className="text-sm font-semibold text-purple-900 cursor-pointer">
            去重后的父块 · {r.parentsFed.length} 条
            {r.duplicateChildIdsDropped.length > 0 ? `（丢弃重复 ${r.duplicateChildIdsDropped.length} 个子块）` : ""}
          </summary>
          <div className="text-xs space-y-2 mt-2">
            {r.duplicateChildIdsDropped.length > 0 ? (
              <p className="text-amber-800">丢弃的重复子块（命中同父）：{r.duplicateChildIdsDropped.join("、")}</p>
            ) : null}
            {r.parentsFed.map(function (p) {
              return (
                <div key={p.id} className="bg-white border border-purple-200 rounded p-2">
                  <p className="font-mono">
                    id={p.id} · 由子块 {p.hitChildIds.join("、")} 命中
                  </p>
                  <p className="font-medium">{p.title}</p>
                  <pre className="whitespace-pre-wrap max-h-32 overflow-auto bg-gray-50 p-2 rounded">
                    {p.text}
                  </pre>
                </div>
              );
            })}
          </div>
        </details>

        {/* 答复 */}
        <div className="bg-green-50 border border-green-300 rounded p-3 space-y-1">
          <p className="text-sm font-semibold">模型答复（reply · 多路合并后落到用户那一行）</p>
          <p className="text-xs text-gray-500">生成读了上面去重后的父块。完整 messages 与 completion 暂不在本页展示。</p>
          <pre className="text-sm whitespace-pre-wrap">{r.reply}</pre>
          <p className="text-xs text-gray-500">finish_reason：{r.modelResponse.finishReason} · 模型：{r.model}</p>
        </div>
      </div>
    );
  };
})();