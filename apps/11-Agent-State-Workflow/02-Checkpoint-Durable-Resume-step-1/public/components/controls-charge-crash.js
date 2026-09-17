/**
 * 职责：扣款后还没写成这一页的开始 / 走一步 / 模拟扣款不写检查点 / 恢复。
 * 数据流：点按钮 → onStart / onStep / onChargeCrash / onResume / onRead / onReadPayment。
 * 为什么单独成文件：这一页才出现支付渠道账本和「故意不写检查点」。
 */
window.DemoUI = window.DemoUI || {};

function Controls(props) {
  const atCharge = props.currentNode === "chargeCard";
  return (
    <div className="space-y-3">
      <label className="block text-sm text-gray-800">
        饮品名称（drinkName）
        <input
          className="mt-1 w-full border rounded px-2 py-1 text-sm"
          value={props.drinkName}
          onChange={function (event) {
            props.onDrinkNameChange(event.target.value);
          }}
          disabled={props.busy}
        />
      </label>
      <p className="text-xs text-gray-600">
        先开始、再只走一步到扣会员卡站，再点模拟按钮。点单名称留空会看到 HTTP 400。还没走到扣卡站就点模拟按钮，会看到另一类 HTTP 400。
      </p>
      <p className="text-xs text-gray-700">
        {props.runId
          ? "当前任务运行编号（runId）：" + props.runId
          : "还没有任务运行编号（runId）。请先点「开始这件任务运行」。"}
      </p>
      <p className="text-xs text-gray-700">
        {props.runId
          ? props.inMemory
            ? "服务端内存里：有这一件任务运行"
            : "服务端内存里：空的（刚模拟完进程没了，或刚重启过服务）"
          : "服务端内存里：还没有任务运行"}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
          disabled={props.busy}
          onClick={props.onStart}
        >
          开始这件任务运行
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId || props.stopped}
          onClick={props.onStep}
        >
          走一步（写入检查点 Checkpoint）
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId}
          onClick={props.onRead}
        >
          从磁盘再读一次检查点
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId}
          onClick={props.onReadPayment}
        >
          再读一次支付渠道账本
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-orange-400 text-orange-900 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId || !props.inMemory || !atCharge}
          onClick={props.onChargeCrash}
        >
          模拟：扣款成功但检查点还没写到磁盘
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-blue-400 text-blue-800 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId}
          onClick={props.onResume}
        >
          从磁盘恢复到内存
        </button>
      </div>
      <p className="text-xs text-gray-600">
        模拟按钮只在「内存里有这件任务运行、并且当前停在扣会员卡」时能点。
      </p>
    </div>
  );
}

window.DemoUI.Controls = Controls;
