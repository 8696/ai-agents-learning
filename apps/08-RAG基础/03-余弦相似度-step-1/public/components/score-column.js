/**
 * 职责：一把尺子一列。按钮只打本侧 URL，不替另外两列发请求。
 *       合并版支持三 mode：raw（无 K 无阈值）/ topk（K 截断）/ threshold（K + 阈值）。
 *       props.mode = "raw" | "topk" | "threshold"。
 */
(function () {
  const DemoUI = (window.DemoUI = window.DemoUI || {});

  const TITLE = {
    cosine: "余弦相似度（Cosine Similarity）",
    dot: "点积（Dot Product）",
    euclidean: "欧氏距离（Euclidean Distance）",
  };

  DemoUI.ScoreColumn = function ScoreColumn(props) {
    const result = props.result;
    const mode = props.mode || "raw";
    const showK = mode === "topk" || mode === "threshold";
    const showThreshold = mode === "threshold";
    return (
      <div className="border border-gray-200 rounded p-3 space-y-2 bg-white">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-medium">{TITLE[props.metric]}</div>
          {(showK || showThreshold) ? (
            <div className="flex flex-col gap-1 text-xs text-gray-600">
              {showK ? (
                <label className="flex items-center gap-1">
                  K =
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={props.k}
                    disabled={props.busy}
                    onChange={function (event) { props.onKChange(event.target.value); }}
                    className="border border-gray-300 rounded px-1 py-0.5 w-12 text-xs"
                  />
                  <span className="text-gray-500">/ 共 {props.totalCards} 张</span>
                </label>
              ) : null}
              {showThreshold ? (
                <label className="flex items-center gap-1">
                  阈值 =
                  <input
                    type="number"
                    step="0.05"
                    min={-2}
                    max={20}
                    value={props.threshold}
                    disabled={props.busy}
                    onChange={function (event) { props.onThresholdChange(event.target.value); }}
                    className="border border-gray-300 rounded px-1 py-0.5 w-16 text-xs"
                  />
                  <span className="text-gray-500">{props.metric === "euclidean" ? "上限" : "下限"}</span>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="text-xs text-gray-600">{props.hint}</p>
        <button
          type="button"
          className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded disabled:opacity-50"
          disabled={props.busy}
          onClick={props.onRun}
        >
          {props.buttonLabel}
        </button>
        {result && result.ok === false ? (
          <p className="text-xs text-red-700 bg-red-50 border border-red-300 rounded p-2">
            {result.error}
          </p>
        ) : null}
        {result && result.decision === "abstain" ? (
          <div className="bg-gray-100 border border-gray-400 rounded p-2 text-xs space-y-1">
            <div className="font-medium text-gray-700">
              ⚠ 标记不可用（decision: abstain）· 阈值 {result.threshold.toFixed(4)}
            </div>
            <div className="text-gray-700">最高分（maxScore）：{result.maxScore.toFixed(4)}</div>
            <div className="text-gray-700">{result.abstainReason}</div>
            <div className="text-gray-600">
              前 K 条仍按本侧尺子排序存在（topK），但模型**不应**拿它们当答案。
            </div>
          </div>
        ) : null}
        {result && result.topK ? (
          <ol className="text-xs space-y-1">
            {result.topK.map(function (card) {
              return (
                <li key={card.id} className="border-t pt-1">
                  <div>第 {card.rank} 名 · 分数 {card.score.toFixed(4)}</div>
                  <div className="text-gray-800">{card.text || card.label}</div>
                </li>
              );
            })}
          </ol>
        ) : null}
        {result && result.dropped && result.dropped.length > 0 ? (
          <div className="bg-gray-50 border border-gray-300 rounded p-2 text-xs space-y-1">
            <div className="font-medium text-gray-700">
              被截掉（{result.dropped.length} 张，最低分住这里）
            </div>
            <ol className="space-y-1">
              {result.dropped.map(function (card) {
                return (
                  <li key={card.id} className="border-t pt-1">
                    <div>第 {card.rank} 名 · 分数 {card.score.toFixed(4)}</div>
                    <div className="text-gray-700">{card.text || card.label}</div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
        {result && result.判定 ? (
          <p className="text-xs bg-green-50 border border-green-300 rounded p-2">{result.判定}</p>
        ) : null}
      </div>
    );
  };
})();