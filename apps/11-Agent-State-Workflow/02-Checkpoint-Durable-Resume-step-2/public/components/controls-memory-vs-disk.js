/**
 * 职责：内存 vs 磁盘对照这一页的控件——左开「只放内存」件、右开「真写磁盘」件、各自走一步、左 forget、右 forget。
 * 数据流：点按钮 → onStart{Left,Right} / onStep{Left,Right} / onForget{Left,Right} / onReadMemory{Left,Right}。
 * 为什么单独成文件：变体 B 的对照只在这一页。
 */
window.DemoUI = window.DemoUI || {};

function SideControls(props) {
  return (
    <div className="space-y-2 border border-gray-200 rounded p-2 bg-white">
      <p className="text-sm font-semibold text-gray-800">{props.title}</p>
      <label className="block text-xs text-gray-700">
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
      <div className="flex flex-wrap gap-2">
        <button type="button" className={"px-3 py-1.5 rounded text-white text-sm disabled:opacity-50 " + (props.side === "left" ? "bg-blue-600" : "bg-purple-600")}
          disabled={props.busy} onClick={props.onStart}>开这件</button>
        <button type="button" className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId || props.stopped} onClick={props.onStep}>{props.stepLabel}</button>
        <button type="button" className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId || !props.inMemory} onClick={props.onForget}>清空内存</button>
        <button type="button" className="px-3 py-1.5 rounded border border-blue-400 text-blue-800 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId} onClick={props.onReadMemory}>读一次内存状态</button>
      </div>
    </div>
  );
}

function Controls(props) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <SideControls side="left" title="只放内存（in-memory · 模拟 LangGraph MemorySaver）"
        drinkName={props.leftDrinkName} runId={props.leftRunId} inMemory={props.leftInMemory} stopped={props.leftStopped}
        busy={props.busy} stepLabel="走一步（不写磁盘）"
        onDrinkNameChange={props.onLeftDrinkNameChange}
        onStart={props.onStartLeft} onStep={props.onStepLeft} onForget={props.onForgetLeft} onReadMemory={props.onReadMemoryLeft} />
      <SideControls side="right" title="真写磁盘（write to disk · 真实持久化）"
        drinkName={props.rightDrinkName} runId={props.rightRunId} inMemory={props.rightInMemory} stopped={props.rightStopped}
        busy={props.busy} stepLabel="走一步（写磁盘）"
        onDrinkNameChange={props.onRightDrinkNameChange}
        onStart={props.onStartRight} onStep={props.onStepRight} onForget={props.onForgetRight} onReadMemory={props.onReadMemoryRight} />
    </div>
  );
}

window.DemoUI.MemoryVsDiskControls = Controls;
