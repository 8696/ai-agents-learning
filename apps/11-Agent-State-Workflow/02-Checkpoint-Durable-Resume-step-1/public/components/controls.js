/**
 * 职责：写入检查点这一页的开始 / 走一步 / 读文件。
 * 数据流：点按钮 → 调用 App 传入的 onStart / onStep / onRead。
 * 为什么单独成文件：这一页不出现清空内存、模拟扣款。
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
      <p className="text-xs text-gray-600">
        点「开始这件任务运行」只在内存里建编号，不写文件。点单名称留空会看到 HTTP 400。名称里带「热」走热饮制作（brewHot）。
      </p>
      <p className="text-xs text-gray-700">
        {props.runId
          ? "当前任务运行编号（runId）：" + props.runId
          : "还没有任务运行编号（runId）。请先点「开始这件任务运行」。"}
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
          从磁盘再读一次
        </button>
      </div>
      <p className="text-xs text-gray-600">
        点「走一步」只跑当前这一站，把检查点覆盖写到同一份文件。走一步之前去读，应看到 HTTP 404。
      </p>
    </div>
  );
}

window.DemoUI.Controls = Controls;
