/**
 * 职责：先规划路径的多版本计划卡 + 带 planVersion 的执行卡。
 * 数据流：plans[]（旧版灰卡 / 最新绿卡）+ executeTrace → 卡片。
 * 颜色：已废灰卡 / 当前执行蓝绿卡 / 兜底橙卡；执行成功绿 / 失败红。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.PlanPanel = function PlanPanel(props) {
  const data = props.data;
  const plans = data.plans || [];
  return (
    <div className="space-y-3">
      <div id="plans-stack" className="space-y-2">
        {plans.map((p, idx) => {
          const isActive = idx === plans.length - 1;
          const borderColor = p.fallback ? "border-orange-400" : (isActive ? "border-green-500" : "border-gray-400");
          const bgColor = p.fallback ? "bg-orange-50" : (isActive ? "bg-green-50" : "bg-gray-100");
          const titleColor = isActive ? "text-gray-900" : "text-gray-600";
          return (
            <div key={p.version} className={"border-2 rounded p-3 space-y-2 " + borderColor + " " + bgColor}>
              <div className="flex items-baseline justify-between">
                <div className={"text-xs font-semibold " + titleColor}>
                  计划 v{p.version}
                  {isActive ? "（当前执行 · 绿卡）" : "（已废 · 灰卡）"}
                  {p.reason ? <span className="text-gray-500 ml-2">· 触发原因：{p.reason}</span> : null}
                </div>
                <div className={"text-xs " + titleColor}>
                  {p.fallback ? "⚠ 兜底 mock" : "✅ 真模型规划"}
                </div>
              </div>
              <ol className="text-xs space-y-1">
                {p.steps.map((s) => (
                  <li key={s.index} className="font-mono text-gray-900">
                    {s.index}. {s.tool}({JSON.stringify(s.args)})
                    <span className="text-gray-700 font-sans"> · {s.reason}</span>
                  </li>
                ))}
              </ol>
              {isActive && p.rawText ? (
                <details className="text-xs text-gray-700">
                  <summary className="cursor-pointer">模型原话（仅最新版）</summary>
                  <pre className="mt-1 whitespace-pre-wrap max-h-40 overflow-auto bg-white border border-gray-300 rounded p-2 font-mono">
                    {p.rawText}
                  </pre>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="text-xs text-gray-500">↓ 执行阶段 · 每步标 planVersion ↓</div>
      {data.executeTrace.map((step) => (
        <div key={"v" + step.planVersion + "-" + step.index} className="border border-gray-300 bg-white rounded p-3 space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="text-xs font-semibold text-gray-700">
              执行第 {step.index} 步
              <span className="text-xs text-blue-700 ml-2">v{step.planVersion}</span>
            </div>
            <div className="text-xs text-gray-500">耗时 {step.costMs} ms</div>
          </div>
          <div className="text-xs text-gray-700 bg-gray-50 rounded p-2 font-mono">
            {step.step.tool}({JSON.stringify(step.step.args)})
          </div>
          <div className={"text-xs rounded p-2 border " + (step.result.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50")}>
            <span className="text-gray-500">tool_result：</span>
            <span className="font-mono">{JSON.stringify(step.result.result)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
