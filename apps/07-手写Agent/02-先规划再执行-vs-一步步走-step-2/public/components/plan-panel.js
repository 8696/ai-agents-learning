/**
 * 职责：先规划路径的计划卡 + 执行卡；标 plannerFallback（真模型 / 兜底 mock）。
 * 数据流：plan 数组（必须在执行卡之前渲染）+ executeTrace + plannerRawText → 蓝/橙计划卡 + 白执行卡。
 * 颜色：蓝边 = 真模型规划；橙边 = 解析失败兜底；执行成功绿 / 失败红。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.PlanPanel = function PlanPanel(props) {
  const data = props.data;
  const plan = data.plan || [];
  const fallback = Boolean(data.plannerFallback);
  return (
    <div className="space-y-3">
      <div id="plan-card" className={"border-2 rounded p-3 space-y-2 " + (fallback ? "border-orange-400 bg-orange-50" : "border-blue-400 bg-blue-50")}>
        <div className="flex items-baseline justify-between">
          <div className="text-xs font-semibold text-gray-900">计划 v1（plan · 第一次 Act 之前就存在）</div>
          <div className="text-xs text-gray-700">
            {fallback ? "⚠ 兜底 mock（模型没解析出来）" : "✅ 真模型规划"}
          </div>
        </div>
        <ol className="text-xs space-y-1">
          {plan.map((s) => (
            <li key={s.index} className="font-mono text-gray-900">
              {s.index}. {s.tool}({JSON.stringify(s.args)})
              <span className="text-gray-700 font-sans"> · {s.reason}</span>
            </li>
          ))}
        </ol>
        <details className="text-xs text-gray-700">
          <summary className="cursor-pointer">模型原话（plannerRawText）</summary>
          <pre className="mt-1 whitespace-pre-wrap max-h-40 overflow-auto bg-white border border-gray-300 rounded p-2 font-mono">
            {data.plannerRawText || "(空)"}
          </pre>
        </details>
      </div>
      <div className="text-xs text-gray-500">↓ 下面是「第一次 Act 之后」的执行阶段 ↓</div>
      {data.executeTrace.map((step) => (
        <div key={step.index} className="border border-gray-300 bg-white rounded p-3 space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="text-xs font-semibold text-gray-700">执行第 {step.index} 步</div>
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
