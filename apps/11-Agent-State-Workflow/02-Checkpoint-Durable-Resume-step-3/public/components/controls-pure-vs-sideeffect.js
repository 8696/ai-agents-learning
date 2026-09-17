/**
 * 职责：纯计算 vs 扣款对照这一页的控件——左「识别饮品后被杀」+ 右「扣款中途被杀」并排。
 * 数据流：点按钮 → onStart{Left,Right} / onStep{Left,Right} / onKillMidRight（调 charge-crash 端点）/ onForget{Left,Right} / onResume{Left,Right} / onReadPayment{Left,Right}。
 * 为什么单独成文件：变体 M 的对照只在这一页。
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
          disabled={props.busy || !props.runId || props.stopped} onClick={props.onStep}>走一步（写盘）</button>
        {props.killMid ? (
          <button type="button" className="px-3 py-1.5 rounded border border-orange-400 text-orange-900 text-sm disabled:opacity-50"
            disabled={props.busy || !props.runId || !props.inMemory || !props.atCharge}
            onClick={props.onKillMid}>模拟：杀在 chargeCard 中途</button>
        ) : null}
        <button type="button" className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId || !props.inMemory} onClick={props.onForget}>清空内存</button>
        <button type="button" className="px-3 py-1.5 rounded border border-blue-400 text-blue-800 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId} onClick={props.onResume}>从磁盘恢复</button>
        <button type="button" className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-50"
          disabled={props.busy || !props.runId} onClick={props.onReadPayment}>再读一次支付渠道</button>
      </div>
    </div>
  );
}

function Controls(props) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <SideControls side="left" title="纯计算（左 · 识别饮品后被杀）"
        drinkName={props.leftDrinkName} runId={props.leftRunId} inMemory={props.leftInMemory} stopped={props.leftStopped}
        atCharge={false}
        busy={props.busy} killMid={false}
        onDrinkNameChange={props.onLeftDrinkNameChange}
        onStart={props.onStartLeft} onStep={props.onStepLeft} onKillMid={null} onForget={props.onForgetLeft} onResume={props.onResumeLeft} onReadPayment={props.onReadPaymentLeft} />
      <SideControls side="right" title="有副作用（右 · 扣款中途被杀）"
        drinkName={props.rightDrinkName} runId={props.rightRunId} inMemory={props.rightInMemory} stopped={props.rightStopped}
        atCharge={props.rightAtCharge}
        busy={props.busy} killMid={true}
        onDrinkNameChange={props.onRightDrinkNameChange}
        onStart={props.onStartRight} onStep={props.onStepRight} onKillMid={props.onKillMidRight} onForget={props.onForgetRight} onResume={props.onResumeRight} onReadPayment={props.onReadPaymentRight} />
    </div>
  );
}

window.DemoUI.PureVsSideEffectControls = Controls;
