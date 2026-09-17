/**
 * 职责：半份文件退回这一页的控件——开件 / 走一步（同时打开 keepHistory）/ 故意写半份 / 读一次 history / 读一次最新检查点。
 * 数据流：点按钮 → onStart / onStep / onWriteHalf / onList / onReadCheckpoint。
 * 为什么单独成文件：变体 I · 第四种时机的演示只在这一页。
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
          onChange={function (event) { props.onDrinkNameChange(event.target.value); }}
          disabled={props.busy}
        />
      </label>
      <p className="text-xs text-gray-700">
        {props.runId ? "runId：" + props.runId : "还没有 runId。"}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
          disabled={props.busy} onClick={props.onStart}>开这件</button>
        <button type="button" className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId || props.stopped} onClick={props.onStep}>走一步（同时保留历史副本）</button>
        <button type="button" className="px-3 py-1.5 rounded border border-red-400 text-red-800 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId} onClick={props.onWriteHalf}>故意写半份（截断主文件）</button>
        <button type="button" className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId} onClick={props.onList}>读一次 history</button>
        <button type="button" className="px-3 py-1.5 rounded border border-blue-400 text-blue-800 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId} onClick={props.onReadCheckpoint}>读一次最新检查点</button>
      </div>
    </div>
  );
}

window.DemoUI.HalfWrittenControls = Controls;
