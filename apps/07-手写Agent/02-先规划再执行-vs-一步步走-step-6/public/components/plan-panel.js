/**
 * 职责：右栏计划卡。planStage=planned 只显示待确认清单；executed 才显示执行卡。
 * 数据流：plans[] + executeTrace + planStage → 卡片。颜色：待确认橙 / 已废灰 / 当前绿。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.PlanPanel = function PlanPanel(props) {
  const data = props.data;
  const planStage = props.planStage || "idle";
  const plans = data.plans || [];
  const showExecute = planStage === "executed" && data.executeTrace && data.executeTrace.length > 0;
  return (
    <div className="space-y-3">
      <div id="plans-stack" className="space-y-2">
        {plans.map((p, idx) => {
          const isActive = idx === plans.length - 1;
          const pending = isActive && planStage === "planned";
          const borderColor = pending ? "border-orange-400" : (p.fallback ? "border-orange-400" : (isActive ? "border-green-500" : "border-gray-400"));
          const bgColor = pending ? "bg-orange-50" : (p.fallback ? "bg-orange-50" : (isActive ? "bg-green-50" : "bg-gray-100"));
          return (
            <div key={p.version} className={"border-2 rounded p-3 space-y-2 " + borderColor + " " + bgColor}>
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-semibold text-gray-900">
                  计划 v{p.version}
                  {pending ? "（待确认 · 等你点头）" : ""}
                  {isActive && planStage === "executed" ? "（已确认 + 已执行）" : ""}
                  {!isActive ? "（已废 · 重规划后）" : ""}
                </div>
                <div className="text-xs">{p.fallback ? "⚠ 兜底 mock" : "✅ 真模型规划"}</div>
              </div>
              <ol className="text-xs space-y-1">
                {p.steps.map((s) => (
                  <li key={s.index} className="font-mono text-gray-900">
                    {s.index}. {s.tool}({JSON.stringify(s.args)})
                    <span className="text-gray-700 font-sans"> · {s.reason}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
      {showExecute ? (
        <div className="space-y-2">
          <div className="text-xs text-gray-500">↓ 确认后才出现的执行阶段 ↓</div>
          {data.executeTrace.map((step) => (
            <div key={"v" + step.planVersion + "-" + step.index} className={"border rounded p-3 space-y-2 " + (step.result.ok ? "border-gray-300 bg-white" : "border-orange-400 bg-orange-50")}>
              {step.result.ok === false ? (
                <div className="text-xs font-bold text-orange-900 bg-orange-100 border border-orange-300 rounded p-2">
                  ⚠ 工具失败（{step.step.tool}）· shouldReplan 不看 ok=false
                </div>
              ) : null}
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-semibold text-gray-700">执行第 {step.index} 步 <span className="text-blue-700">v{step.planVersion}</span></div>
                <div className="text-xs text-gray-500">{step.costMs} ms</div>
              </div>
              <div className="text-xs font-mono bg-gray-50 rounded p-2">{step.step.tool}({JSON.stringify(step.step.args)})</div>
              <div className={"text-xs rounded p-2 border " + (step.result.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50")}>
                tool_result：<span className="font-mono">{JSON.stringify(step.result.result)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-orange-800 bg-orange-50 border border-orange-300 rounded p-2">
          还没点确认 → 没有执行卡，也没有 invokeTool（确认前无副作用）。
        </div>
      )}
    </div>
  );
};
