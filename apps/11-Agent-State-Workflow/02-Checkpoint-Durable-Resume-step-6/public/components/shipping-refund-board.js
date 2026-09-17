/**
 * 职责：业务例子图这一页的输出板——显示 currentNode / orderId / isShipped / action / completedNodes。
 * 数据流：App 把最近一次响应传进来。
 * 为什么单独成文件：业务例子图只在这一页。
 */
window.DemoUI = window.DemoUI || {};

const NODE_LABELS = {
  fetchOrder: "查订单（fetchOrder）",
  checkShipment: "看发货（checkShipment）",
  noop: "已发货不操作（noop）",
  refund: "没发货就退款（refund）",
  done: "完成（done）",
};

function labelOf(node) {
  return NODE_LABELS[node] || node || "—";
}

function Board(props) {
  const last = props.last;
  return (
    <div className="min-h-[200px] space-y-3">
      {props.error ? (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm rounded p-3">
          <div className="font-semibold">失败（HTTP {props.error.status || "—"} · {props.error.code || "无编号"}）</div>
          <div>{props.error.message}</div>
        </div>
      ) : null}
      {!last && !props.error ? (
        <p className="text-sm text-gray-500">还没有请求。先填订单号 → 开单 → 走一步（看 currentNode 怎么走）→ 继续走直到 done。</p>
      ) : null}
      {last ? (
        <div className="space-y-3 text-sm">
          {last.state ? (
            <div className="border border-gray-300 bg-white rounded p-3 space-y-1 text-xs">
              <p className="text-sm font-semibold text-gray-800">业务例子图当前状态</p>
              <p className="text-gray-700">任务运行编号（runId）：{last.runId || "—"}</p>
              <p className="text-gray-800">订单号（orderId）：<b>{last.state.orderId || "—"}</b></p>
              <p className="text-gray-800">当前节点（currentNode）：<b>{labelOf(last.state.currentNode)}</b></p>
              <p className="text-gray-800">isShipped：<b>{String(Boolean(last.state.isShipped))}</b>{"（订单号以 <code className=\"bg-gray-100 px-1 rounded\">shipped-</code> 开头 = true）"}</p>
              <p className="text-gray-800">action：<b>{last.state.action || "（无）"}</b></p>
              <p className="text-gray-600">已完成节点：{(last.state.completedNodes || []).map(labelOf).join(" → ") || "—"}</p>
            </div>
          ) : null}
          <div className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 text-xs">
            <p className="font-semibold text-yellow-900">本页核心教学点（变体 F 业务例子）</p>
            <p>同一张图（fetchOrder → checkShipment → noop/refund → done）里，用户的语义是「问发货+没发就退款」一次性业务，**一份 runId 走完**。State 共享（orderId、isShipped 两个字段跨节点读）、终态一致（都到 done）。</p>
            <p>对照：如果用户在 done 之后再问下一个问题，那是**新一件业务**，新 runId，旧 runId 不再被调度——这是 step-2 next-run 演示的事。</p>
            <p>对照：长流程多步表单跨用户多次输入，**仍**是同一个 runId（State 共享、终态一致）；中间用户多次输入不切断 runId。</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

window.DemoUI.ShippingRefundBoard = Board;
