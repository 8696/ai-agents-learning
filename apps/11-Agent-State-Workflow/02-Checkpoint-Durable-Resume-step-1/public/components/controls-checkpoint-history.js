/**
 * 职责：快照历史这一页的控件——开始 / 走一步（带 keepHistory）/ 读一次历史。
 * 数据流：点按钮 → onStart / onStep / onList。
 * 为什么单独成文件：这一页才出现「保留历史副本」开关（keepHistory）。
 */
window.DemoUI = window.DemoUI || {};

function Controls(props) {
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
      <p className="text-xs text-gray-700">
        {props.runId
          ? "任务运行编号（runId）：" + props.runId
          : "还没有任务运行编号（runId）。请先点「开始这件任务运行」。"}
      </p>
      <p className="text-xs text-gray-700">
        {props.keepHistory ? "已开启 keepHistory：每走一步多写一份历史副本" : "未开启 keepHistory：每一步覆盖写入同一份文件"}
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
          走一步（同时保留历史副本）
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId}
          onClick={props.onList}
        >
          读一次历史
        </button>
      </div>
    </div>
  );
}

window.DemoUI.CheckpointHistoryControls = Controls;
