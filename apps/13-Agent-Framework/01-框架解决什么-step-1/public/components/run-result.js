/**
 * 职责：把一次循环结果拆成「请求参数 / 调用流程 / 响应结果」三块卡片。
 * 数据流：props.result → 是否有 while、调了几次模型、make_latte 次数、每一圈、最终对客人说的话。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.RunResult = function RunResult(props) {
    const result = props.result;
    const request = props.request;
    if (!result && !request) {
      return (
        <p className="text-sm text-gray-500">还没跑。点上面的按钮后，这里会出现请求参数、每一圈、最终回复。</p>
      );
    }
    return (
      <div className="space-y-3">
        {request ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-3">
            <div className="text-xs font-semibold text-gray-700">请求参数（Request）</div>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap mt-1 max-h-32 overflow-auto">
              {JSON.stringify(request, null, 2)}
            </pre>
          </div>
        ) : null}
        {result ? (
          <div className="border border-gray-300 bg-white rounded p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-700">调用流程（Trajectory）</div>
            <p className="text-xs text-gray-600">
              业务代码里有没有 while：<b>{result.hasWhileInBusinessCode ? "有（手写）" : "没有（藏在库里）"}</b>
              {" · "}模型调用次数（modelCallCount）：{result.modelCallCount}
              {" · "}执行 make_latte 次数（toolExecutedCount）：{result.toolExecutedCount}
              {" · "}停止原因（stoppedReason）：{result.stoppedReason}
              {result.frameworkPackage ? " · 框架包：" + result.frameworkPackage : ""}
            </p>
            {(result.rounds || []).map(function (round) {
              return (
                <div key={round.round} className="border border-gray-200 rounded p-2">
                  <div className="text-xs text-gray-500">第 {round.round} 圈 · finish_reason={round.finishReason || "（无）"}</div>
                  <div className="text-xs text-gray-700">
                    工具调用（tool_calls）：{round.toolCallCount} · 名字：{(round.toolNames || []).join(", ") || "（无）"}
                  </div>
                  {round.assistantPreview ? (
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap mt-1 max-h-24 overflow-auto">{round.assistantPreview}</pre>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {result ? (
          <div className="bg-green-50 border border-green-300 rounded p-3">
            <div className="text-xs font-semibold text-green-900">响应结果 · 对客人说的话（finalAnswer）</div>
            <pre className="text-sm text-gray-800 whitespace-pre-wrap mt-1 max-h-40 overflow-auto">
              {result.finalAnswer || "（模型没给出正文）"}
            </pre>
            <div className="text-xs text-gray-500 mt-1">耗时 {result.elapsedMs} ms</div>
          </div>
        ) : null}
      </div>
    );
  };
})();
