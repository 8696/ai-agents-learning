/**
 * 职责：不可序列化这一页的控件——先写合法快照，再分别塞函数 / Map / Date。
 * 数据流：点按钮 → App 传入的 onStart / onStep / onRead / onDirty。
 * 为什么单独成文件：脏类型三个按钮不要和扣款页、恢复页叠在一起。
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
        先「开始」再「走一步」，磁盘上要有一份合法 JSON。点单名称留空会看到 HTTP 400。还没开始就点下面三个「故意塞」按钮，会看到另一类 HTTP 400。
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
          走一步（写入合法检查点）
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId}
          onClick={props.onRead}
        >
          从磁盘再读一次合法快照
        </button>
      </div>
      <p className="text-xs text-gray-700">
        下面三个按钮各发一次 POST /api/run/serialize-dirty，kind 不同。不会覆盖上面那份合法文件。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-orange-400 text-orange-900 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId}
          onClick={function () {
            props.onDirty("function");
          }}
        >
          故意塞函数再写入
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-orange-400 text-orange-900 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId}
          onClick={function () {
            props.onDirty("map");
          }}
        >
          故意塞 Map 再写入
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-orange-400 text-orange-900 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId}
          onClick={function () {
            props.onDirty("date");
          }}
        >
          故意塞 Date 再写入
        </button>
      </div>
    </div>
  );
}

window.DemoUI.Controls = Controls;
