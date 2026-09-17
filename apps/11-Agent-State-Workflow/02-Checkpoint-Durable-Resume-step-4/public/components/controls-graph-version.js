/**
 * 职责：图版本失败可见这一页的控件——开件 / 走一步(写盘带 graphVersion) / 切换图版本 / 读一次检查点。
 * 数据流：点按钮 → onStart / onStep / onSetVersion / onReadCheckpoint。
 * 为什么单独成文件：变体 J 的演示只在这一页。
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
      <label className="block text-sm text-gray-800">
        切到的图版本（version）
        <input
          className="mt-1 w-full border rounded px-2 py-1 text-sm"
          value={props.version}
          onChange={function (event) { props.onVersionChange(event.target.value); }}
          disabled={props.busy}
        />
      </label>
      <p className="text-xs text-gray-700">
        {props.runId ? "runId：" + props.runId : "还没有 runId。点「开这件」。"}
      </p>
      <p className="text-xs text-gray-700">
        进程内当前 graphVersion：<b>{props.currentVersion || "—"}</b>
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
          disabled={props.busy} onClick={props.onStart}>开这件</button>
        <button type="button" className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId || props.stopped} onClick={props.onStep}>走一步（写盘带 graphVersion）</button>
        <button type="button" className="px-3 py-1.5 rounded border border-orange-400 text-orange-900 text-sm disabled:opacity-50"
          disabled={props.busy || !props.version} onClick={props.onSetVersion}>切图版本到上方输入框里的值</button>
        <button type="button" className="px-3 py-1.5 rounded border border-blue-400 text-blue-800 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId} onClick={props.onReadCheckpoint}>读一次最新检查点</button>
      </div>
    </div>
  );
}

window.DemoUI.GraphVersionControls = Controls;
