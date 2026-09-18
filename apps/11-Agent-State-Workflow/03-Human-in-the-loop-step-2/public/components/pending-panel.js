/**
 * 职责：待审批卡片。把将要发生的转账摊开给人看，而不是已经发生后的通知。
 * 数据流：App 传入 snapshot.pending 与 snapshot.currentNode。
 * 为什么单独成文件：等待节点的可见形状要单独讲。
 */
window.DemoUI = window.DemoUI || {};

function PendingPanel(props) {
  const pending = props.pending;
  const currentNode = props.currentNode;
  if (!pending) {
    return (
      <div className="border border-gray-200 rounded p-3 text-xs text-gray-500">
        当前没有待审批。当前节点（currentNode）：{currentNode || "idle"}。
      </div>
    );
  }

  // 四态用不同颜色，避免把「已通过」绿当成「已拒绝 / 执行失败」的视觉错位。
  const STYLES = {
    waiting:        { wrap: "border border-yellow-300 bg-yellow-50", tip: "人还没点头，扣款函数不许进。" },
    executed:       { wrap: "border border-green-300 bg-green-50",   tip: "人已通过，扣款函数已经跑过。" },
    rejected:       { wrap: "border border-gray-300 bg-gray-50",     tip: "人已拒绝，账本未动，扣款函数从未进。" },
    failed:         { wrap: "border border-orange-400 bg-orange-50", tip: "人已通过，但执行失败（账本未动、调用次数仍是 0）。不是「人拒绝」。" },
  };
  const style = STYLES[pending.status] || STYLES.waiting;

  return (
    <div className={style.wrap + " rounded p-3 space-y-1"}>
      <div className="text-xs font-semibold text-gray-800">
        待审批的操作（pending approval）
      </div>
      <p className="text-xs text-gray-700">
        任务运行编号（runId）：{pending.runId}
      </p>
      <p className="text-xs text-gray-700">
        工具（tool）：{pending.tool} · 状态（status）：{pending.status}
      </p>
      <p className="text-sm text-gray-900">
        将向 {pending.args && pending.args.to} 转 {pending.args && pending.args.amount} 元
      </p>
      <p className="text-xs text-gray-600">
        当前节点（currentNode）：{currentNode}。{style.tip}
      </p>
    </div>
  );
}

window.DemoUI.PendingPanel = PendingPanel;
