/**
 * 职责：节点失败对照这一页的控件——开件 / 走一步 / 让 brewHot 失败 / 走一步触发失败 / 再走一步。
 * 数据流：点按钮 → onStart / onStep / onSetFailFlag / onStepAgain / onRead。
 * 为什么单独成文件：变体 G 之外的「节点失败 ≠ 进程被杀掉」对照只在这一页。
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
        {props.runId ? "runId：" + props.runId : "还没有 runId。点「开这件」。"}
      </p>
      <p className="text-xs text-gray-700">
        服务端内存里有这件任务运行：<b>{String(Boolean(props.inMemory))}</b>
        {" · "}
        brewFailOnStep 标志：<b>{String(Boolean(props.failFlagSet))}</b>
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
          disabled={props.busy} onClick={props.onStart}>开这件</button>
        <button type="button" className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId || props.stopped} onClick={props.onStep}>走一步</button>
        <button type="button" className="px-3 py-1.5 rounded border border-orange-400 text-orange-900 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId || !props.inMemory || !props.atBrew}
          onClick={props.onSetFailFlag}>让 brewHot 失败（设标志）</button>
        <button type="button" className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId || !props.failFlagSet || props.stopped} onClick={props.onStepAgain}>走一步（触发失败）</button>
        <button type="button" className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId} onClick={props.onRead}>从磁盘再读一次</button>
      </div>
    </div>
  );
}

window.DemoUI.NodeFailControls = Controls;
