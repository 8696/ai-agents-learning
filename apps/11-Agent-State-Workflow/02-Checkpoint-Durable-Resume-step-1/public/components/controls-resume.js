/**
 * 职责：从磁盘恢复这一页的开始 / 走一步 / 清空内存 / 恢复 + 真实杀服务再起引导。
 * 数据流：点按钮 → onStart / onStep / onForget / onResume / onRead / onShowKillCommands。
 * 为什么单独成文件：这一页的教学点是内存空了之后从文件继续；同进程 forget 模拟 + 终端真杀两端到端引导都在这一页。
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
        先开始、再走至少一步，磁盘上才有检查点。点单名称留空会看到 HTTP 400。
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
            : "服务端内存里：空的（模拟进程没了，或刚重启过服务）"
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
          从磁盘再读一次
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-red-300 text-red-800 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId}
          onClick={props.onForget}
        >
          清空服务端内存（同进程模拟进程没了）
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
        「清空服务端内存」是同进程模拟，不能替代真杀。要真正验证「杀进程再起来要保证什么」，请在终端里把服务进程杀掉再起一次。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-purple-400 text-purple-900 text-sm disabled:opacity-50"
          disabled={props.busy}
          onClick={props.onShowKillCommands}
        >
          显示「在终端杀掉再起服务」的命令
        </button>
      </div>
    </div>
  );
}

window.DemoUI.Controls = Controls;
