/**
 * 职责：终态开新业务这一页的控件——开第一件 / 走第一件 / 走到底（直到 okEnd）/ 开下一件 / 反例按钮。
 * 数据流：点按钮 → onStart / onStep / onNext / onNextBad。
 * 为什么单独成文件：变体 F · 做法 1/2 的演示只在这一页。
 */
window.DemoUI = window.DemoUI || {};

function Controls(props) {
  return (
    <div className="space-y-3">
      <label className="block text-sm text-gray-800">
        上一件饮品名称（drinkName · 第一件）
        <input
          className="mt-1 w-full border rounded px-2 py-1 text-sm"
          value={props.firstDrinkName}
          onChange={function (event) { props.onFirstDrinkNameChange(event.target.value); }}
          disabled={props.busy}
        />
      </label>
      <p className="text-xs text-gray-700">
        {props.firstRunId
          ? "第一件 runId：" + props.firstRunId
          : "还没有第一件 runId。点「开第一件」。"}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
          disabled={props.busy} onClick={props.onStartFirst}>开第一件</button>
        <button type="button" className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm disabled:opacity-50"
          disabled={props.busy || !props.firstRunId || props.firstStopped}
          onClick={props.onStepFirst}>走一步（写盘）</button>
        <button type="button" className="px-3 py-1.5 rounded border border-orange-400 text-orange-900 text-sm disabled:opacity-50"
          disabled={props.busy || !props.firstRunId || props.firstStopped}
          onClick={props.onWalkToEnd}>一路走到完成（okEnd）</button>
      </div>

      <hr className="my-2 border-gray-200" />

      <label className="block text-sm text-gray-800">
        下一件饮品名称（drinkName · 下一件）
        <input
          className="mt-1 w-full border rounded px-2 py-1 text-sm"
          value={props.nextDrinkName}
          onChange={function (event) { props.onNextDrinkNameChange(event.target.value); }}
          disabled={props.busy}
        />
      </label>
      <p className="text-xs text-gray-700">
        {props.nextRunId
          ? "下一件 runId：" + props.nextRunId + (props.nextParentRunId ? " · parentRunId = " + props.nextParentRunId : "")
          : "还没有下一件。"}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="px-3 py-1.5 rounded bg-purple-600 text-white text-sm disabled:opacity-50"
          disabled={props.busy || !props.firstRunId || !props.firstStopped}
          onClick={props.onNext}>开下一件（带 parentRunId）</button>
        <button type="button" className="px-3 py-1.5 rounded border border-red-400 text-red-800 text-sm disabled:opacity-50"
          disabled={props.busy || !props.firstRunId || props.firstStopped}
          onClick={props.onNextBad}>反例：第一件还没到 okEnd 就开下一件</button>
      </div>
    </div>
  );
}

window.DemoUI.NextRunControls = Controls;
