/**
 * 职责：一步步走的一圈卡片（Reason 想法 + tool_call + tool_result）。
 * 数据流：round 对象 → 白卡。颜色：成功绿底 / 失败红底 / 空 tool_calls 绿卡最终答案。
 * 为什么单独成文件：index.html 只负责发请求；圈卡片结构占行多。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.RoundCard = function RoundCard(props) {
  const round = props.round;
  return (
    <div className="border border-gray-300 bg-white rounded p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-semibold text-gray-700">第 {round.index} 圈 · Reason</div>
        <div className="text-xs text-gray-500">耗时 {round.costMs} ms</div>
      </div>
      <div className="text-xs text-gray-700 bg-gray-50 rounded p-2">
        <span className="text-gray-500">想法：</span>{round.reason.thought}
      </div>
      {round.reason.tool_calls.length > 0 ? (
        <div className="space-y-1">
          <div className="text-xs text-gray-500">tool_calls（这一步调啥）</div>
          {round.act.map((a, i) => (
            <div
              key={i}
              className={"text-xs rounded p-2 border " + (a.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50")}
            >
              <div className="font-mono">{a.tool}({JSON.stringify(a.args)})</div>
              <div className="text-gray-600 mt-1">
                tool_result：<span className="font-mono">{JSON.stringify(a.result)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-green-700 bg-green-50 border border-green-300 rounded p-2">
          tool_calls 为空 → 最终答案
        </div>
      )}
    </div>
  );
};
