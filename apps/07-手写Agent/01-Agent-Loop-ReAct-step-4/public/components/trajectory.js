/**
 * 职责：按圈展开 Reason / Act / Observe 卡片，加上停止原因徽标和最终答案绿卡。
 * 数据流：result.trajectory → 一圈一张卡。挂 window.DemoUI。
 * 为什么单独成文件：圈卡片结构占行多；index.html 只负责发请求和拼装。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.Trajectory = function Trajectory(props) {
  const result = props.result;
  const stoppedClass =
    result.stoppedReason === "final_answer" ? "bg-green-50 border border-green-300 text-green-800" :
    result.stoppedReason === "cancelled" ? "bg-purple-50 border border-purple-300 text-purple-800" :
    "bg-yellow-50 border border-yellow-300 text-yellow-800";
  const stoppedText =
    result.stoppedReason === "final_answer" ? "最终答案（变体 J）" :
    result.stoppedReason === "cancelled" ? "用户取消（变体 M）" :
    "达到最大轮次（兜底 · 不指望触发）";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div className="text-gray-700">
          <b>轨迹（trajectory · Loop 一圈一张卡）</b> · 共 <b>{result.rounds}</b> 圈 · 停止原因：
          <span className={"ml-1 px-2 py-0.5 rounded text-xs " + stoppedClass}>{stoppedText}</span>
        </div>
        <div className="text-xs text-gray-500">任务：<b>{result.query}</b></div>
      </div>

      {result.trajectory.map((step, idx) => {
        const isCancelledFinalRound = result.status === "cancelled" && idx === result.trajectory.length - 1;
        return (
          <div
            key={idx}
            className={
              "border rounded p-3 space-y-2 " +
              (isCancelledFinalRound ? "border-purple-400 bg-purple-50" : "border-gray-300 bg-white")
            }
          >
            <div className="flex items-center justify-between text-sm">
              <div className="font-semibold text-gray-800">
                第 <b>{step.round}</b> 圈
                {isCancelledFinalRound && (
                  <span className="ml-2 text-purple-700 text-xs">🚫 用户取消（变体 M · 这一圈跑完才检测到 signal.aborted）</span>
                )}
              </div>
              <div className="text-xs text-gray-500">≈ {step.elapsedMs} ms</div>
            </div>

            <div className="bg-gray-50 border border-gray-300 rounded p-2 text-xs">
              <div className="font-semibold text-gray-700 mb-1">Reason（调模型）</div>
              {step.assistant.content ? (
                <div className="whitespace-pre-wrap mb-1">{step.assistant.content}</div>
              ) : (
                <div className="text-gray-400 italic mb-1">（assistant.content 为空 · 模型本圈纯调工具）</div>
              )}
              {step.assistant.tc.length === 0 ? (
                <div className="text-green-700">
                  → <b>tool_calls 为空 · 最终答案</b>（变体 J · Loop 在本圈 break）
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-gray-600">→ 要调 {step.assistant.tc.length} 个工具：</div>
                  {step.assistant.tc.map((tc, i) => (
                    <div key={tc.id} className="bg-white border border-gray-200 rounded p-1 text-gray-700">
                      <span className="text-gray-500">#{i + 1}</span>{" "}
                      <b>{tc.function.name}</b>(
                      <span className="font-mono text-gray-600">{tc.function.arguments}</span>
                      ) · id={tc.id}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {step.toolResults.length > 0 && (
              <div className="border border-green-300 bg-green-50 rounded p-2 text-xs">
                <div className="font-semibold text-green-800 mb-1">
                  Act + Observe（执行工具 → tool_result 塞回 messages）
                </div>
                <div className="space-y-2">
                  {step.toolResults.map((tr, i) => {
                    let parsed = null;
                    try { parsed = JSON.parse(tr.content); } catch (e) { parsed = null; }
                    const isErr = parsed && parsed.ok === false;
                    return (
                      <div
                        key={tr.tool_call_id}
                        className={
                          "rounded p-2 border " +
                          (isErr
                            ? "bg-red-50 border-red-300 text-red-800"
                            : "bg-white border-green-300 text-gray-800")
                        }
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <span className="text-gray-500">#{i + 1}</span>{" "}
                            <b>{tr.name}</b>(
                            <span className="font-mono">{JSON.stringify(tr.arguments)}</span>)
                          </div>
                          <span className={"text-xs px-2 py-0.5 rounded " + (isErr ? "bg-red-200" : "bg-green-200")}>
                            {isErr ? "失败" : "成功"}
                          </span>
                        </div>
                        <pre className="whitespace-pre-wrap text-gray-700 max-h-32 overflow-auto bg-gray-50 rounded p-1">
                          {parsed ? JSON.stringify(parsed, null, 2) : tr.content}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {result.stoppedReason === "final_answer" && (
        <div className="border border-green-300 bg-green-50 rounded p-3 space-y-1">
          <div className="text-sm font-semibold text-green-900">
            最终答案（变体 J · assistant 正文即答案 · 下一圈不会再来）
          </div>
          <div className="whitespace-pre-wrap text-sm text-green-900">
            {result.finalAnswer || "（模型本圈无正文 · 罕见）"}
          </div>
        </div>
      )}
    </div>
  );
};
