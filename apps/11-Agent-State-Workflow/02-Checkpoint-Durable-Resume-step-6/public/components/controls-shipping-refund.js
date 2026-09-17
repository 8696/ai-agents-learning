/**
 * 职责：业务例子图这一页的控件——开单（填 orderId）/ 走一步。
 * 数据流：点按钮 → onStart / onStep。
 * 为什么单独成文件：变体 F 业务例子图只在这一页。
 */
window.DemoUI = window.DemoUI || {};

function Controls(props) {
  return (
    <div className="space-y-3">
      <label className="block text-sm text-gray-800">
        订单号（orderId；以 <code className="bg-gray-100 px-1 rounded">shipped-</code> 开头的视为已发货；其它视为未发货）
        <input
          className="mt-1 w-full border rounded px-2 py-1 text-sm"
          value={props.orderId}
          onChange={function (event) { props.onOrderIdChange(event.target.value); }}
          disabled={props.busy}
        />
      </label>
      <p className="text-xs text-gray-700">
        {props.runId ? "任务运行编号（runId）：" + props.runId : "还没有 runId。点「开单」。"}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
          disabled={props.busy} onClick={props.onStart}>开单（POST /api/run/shipping-refund/start）</button>
        <button type="button" className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId || props.stopped} onClick={props.onStep}>走一步</button>
      </div>
      <p className="text-xs text-gray-600">
        同图同 runId 演示：用同一份订单号，开一件任务运行，依次走到 fetchOrder → checkShipment → noop（已发货）/ refund（未发货） → done。看 currentNode 走哪条边。
      </p>
    </div>
  );
}

window.DemoUI.ShippingRefundControls = Controls;
