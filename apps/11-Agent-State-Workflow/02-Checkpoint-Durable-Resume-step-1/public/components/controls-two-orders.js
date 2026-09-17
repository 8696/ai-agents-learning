/**
 * 职责：两单编号隔离这一页的控件——左右两份饮品名称输入 + 各自开单 / 走一步 / 清空 / 恢复。
 * 数据流：点按钮 → onOpen{Left,Right} / onStep{Left,Right} / onForget{Left,Right} / onResume{Left,Right}。
 * 为什么单独成文件：这一页才出现「两单并排」。
 */
window.DemoUI = window.DemoUI || {};

function SideControls(props) {
  const side = props.side;
  return (
    <div className="space-y-2 border border-gray-200 rounded p-2 bg-white">
      <p className="text-sm font-semibold text-gray-800">{props.title}</p>
      <label className="block text-xs text-gray-700">
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
          : "还没有任务运行编号（runId）。请先点「开这件」。"}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={"px-3 py-1.5 rounded text-white text-sm disabled:opacity-50 " + (side === "left" ? "bg-blue-600" : "bg-purple-600")}
          disabled={props.busy}
          onClick={props.onOpen}
        >
          开这件
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId || props.stopped}
          onClick={props.onStep}
        >
          走一步
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId || !props.inMemory}
          onClick={props.onForget}
        >
          清空内存
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-blue-400 text-blue-800 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId}
          onClick={props.onResume}
        >
          从磁盘恢复
        </button>
      </div>
    </div>
  );
}

function Controls(props) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <SideControls
        side="left"
        title="张三的拿铁（左）"
        drinkName={props.leftDrinkName}
        runId={props.leftRunId}
        inMemory={props.leftInMemory}
        stopped={props.leftStopped}
        busy={props.busy}
        onDrinkNameChange={props.onLeftDrinkNameChange}
        onOpen={props.onOpenLeft}
        onStep={props.onStepLeft}
        onForget={props.onForgetLeft}
        onResume={props.onResumeLeft}
      />
      <SideControls
        side="right"
        title="李四的美式（右）"
        drinkName={props.rightDrinkName}
        runId={props.rightRunId}
        inMemory={props.rightInMemory}
        stopped={props.rightStopped}
        busy={props.busy}
        onDrinkNameChange={props.onRightDrinkNameChange}
        onOpen={props.onOpenRight}
        onStep={props.onStepRight}
        onForget={props.onForgetRight}
        onResume={props.onResumeRight}
      />
    </div>
  );
}

window.DemoUI.TwoOrdersControls = Controls;
