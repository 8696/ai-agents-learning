/**
 * 职责：变体 M 用户取消紫卡（status === cancelled 才出现）。
 * 数据流：result.status / rounds → 紫卡。挂 window.DemoUI。
 * 为什么单独成文件：只 step-4 用；取消按钮和轮询留在 index.html。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.CancelBadge = function CancelBadge(props) {
  const result = props.result;
  if (result.status !== "cancelled") return null;
  return (
    <div className="border border-purple-300 bg-purple-50 rounded p-3 space-y-2">
      <div className="text-sm font-semibold text-purple-900">
        🚫 用户取消（变体 M · Loop 收到 AbortSignal 后主动退出）
      </div>
      <div className="text-xs text-gray-700">
        跑到第 <b>{result.rounds}</b> 圈后用户点了「取消」按钮 →
        后端 <code className="bg-white px-1 rounded">AbortController.abort()</code> →
        下一次 LLM 调用抛 <code className="bg-white px-1 rounded">AbortError</code> →
        while 检测 <code className="bg-white px-1 rounded">signal.aborted</code> → break →
        <code className="bg-white px-1 rounded">stoppedReason = "cancelled"</code>。
      </div>
      <div className="text-xs text-gray-700">
        <b>关键边界</b>：<b>已发出的 tool handler 不被取消</b>（变体 M 的妥协）—— 让那一圈 Act 跑完，
        trajectory 仍完整保留能看见「跑到哪圈被取消」。对照 MD 例子 5「知识库已发出则在轨迹写『用户取消』」。
      </div>
      <div className="text-xs text-green-700">
        验证「变体 M」= status === <code className="bg-white px-1 rounded">cancelled</code>（不是 error）+ stoppedReason === <code className="bg-white px-1 rounded">cancelled</code>（不是 max_rounds）+ trajectory 保留到取消前的最后一圈 + diff 显示「已发出没回滚」的条数。
      </div>
    </div>
  );
};
