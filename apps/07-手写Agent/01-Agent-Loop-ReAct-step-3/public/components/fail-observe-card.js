/**
 * 职责：变体 G 失败 Observe 后改参卡片（任一圈有失败 toolResult 才出现）。
 * 数据流：result.trajectory 里 content.ok === false 的条数 → 红卡。挂 window.DemoUI。
 * 为什么单独成文件：只 step-3 用；不要塞进巨型 ui.js。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.FailObserveCard = function FailObserveCard(props) {
  const result = props.result;
  let failedCount = 0;
  let firstFailRound = -1;
  let lastFailRound = -1;
  result.trajectory.forEach((s) => {
    const fails = s.toolResults.filter((tr) => {
      try { return JSON.parse(tr.content).ok === false; } catch (e) { return false; }
    });
    if (fails.length > 0) {
      failedCount += fails.length;
      if (firstFailRound === -1) firstFailRound = s.round;
      lastFailRound = s.round;
    }
  });
  if (failedCount === 0) return null;

  return (
    <div className="border border-red-300 bg-red-50 rounded p-3 space-y-2">
      <div className="text-sm font-semibold text-red-900">
        失败 Observe 后改参（变体 G · Loop 自纠闭环）
      </div>
      <div className="text-xs text-gray-700">
        故意触发 <b>{failedCount}</b> 次失败（首圈 round <b>{firstFailRound}</b>，末次 round <b>{lastFailRound}</b>），
        handler 把错误结构化成 <code className="bg-white px-1 rounded">{"{ok:false, error:'not_found', id:'todo-999'}"}</code> 塞回 messages，
        下一圈模型看见后改参 → 成功 → 最终答案。**关键点**：如果 handler <b>throw</b>，整个 Loop 500 中断，模型没机会自纠；
        只有 <b>返回结构化错误</b> 当 tool_result 写进 messages，Loop 才不死。
      </div>
      <div className="text-xs text-green-700">
        验证「变体 G 闭环」= failedCount ≥ 1（故意触发）+ stoppedReason = <code className="bg-white px-1 rounded">final_answer</code>（自纠成功）+ diff 改了真实存在的那条 todo。
      </div>
    </div>
  );
};
