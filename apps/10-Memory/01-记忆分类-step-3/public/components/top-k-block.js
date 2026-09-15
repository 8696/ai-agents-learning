/**
 * 职责：渲染 Top-K 列表（带分数 + 类型色块）；Top-K 为空时显示「没有任何一条相关 + 阈值弃权信息」。
 * 数据流：topK: ScoredFact[] + rejection?: ThresholdRejection → 渲染列表 / 空态 + 弃权详情。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.TopKBlock = function TopKBlock(props) {
    const topK = props.topK || [];
    const rejection = props.rejection || null;
    if (topK.length === 0) {
      return (
        <div className="text-xs space-y-2">
          <p className="text-gray-600">没有任何一条事实在嵌入方向上跟问句接近，Top-K 为空。</p>
          {rejection ? (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded">
              <p className="text-amber-900">被弃的 Top-1（分数低于阈值 {rejection.threshold}）：</p>
              <p className="text-amber-800 mt-1">
                余弦相似度 = <code className="bg-amber-100 px-1 rounded">{rejection.topScore.toFixed(4)}</code>
                　·　原句：{rejection.rejectedTop.fact.sentence}
              </p>
            </div>
          ) : null}
        </div>
      );
    }
    return (
      <div className="space-y-2 max-h-40 overflow-auto">
        {topK.map(function (s, i) {
          const tone = s.fact.memoryType === "情景记忆" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-white";
          return (
            <div key={s.fact.key} className={"border rounded p-2 " + tone}>
              <p>
                <span className="font-semibold">第 {i + 1} 条</span>
                {" · "}<span className="text-xs text-gray-700">{s.fact.memoryType}</span>
                {" · 分数："}
                <code className="bg-blue-100 px-1 rounded">{s.score.toFixed(3)}</code>
              </p>
              <p>{s.fact.sentence}</p>
              <p className="text-gray-600">key：<code className="bg-gray-100 px-1 rounded">{s.fact.key}</code></p>
            </div>
          );
        })}
      </div>
    );
  };
})();