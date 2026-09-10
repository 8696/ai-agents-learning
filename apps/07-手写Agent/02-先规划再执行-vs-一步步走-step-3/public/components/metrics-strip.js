/**
 * 职责：顶部对照（模型调用 / 第一次 Act 前等待 / 计划对象 / 重规划）。
 * 数据流：buildComparison 的结果 → 四张卡。没有两侧数据时不渲染。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.MetricsStrip = function MetricsStrip(props) {
  const c = props.comparison;
  if (!c) return null;
  return (
    <section id="comparison-strip" className="bg-white shadow rounded p-4 space-y-2">
      <div className="text-sm font-semibold text-gray-800">关键对照（数字来自两次独立请求）</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gray-50 border border-gray-300 rounded p-3">
          <div className="text-xs text-gray-600">模型调用次数（model calls）</div>
          <div className="mt-1 text-sm">一步步走 A：<b className="text-red-700">{c.modelCallsA}</b></div>
          <div className="text-sm">先规划 B：<b className="text-green-700">{c.modelCallsB}</b>
            <span className="text-gray-400">{c.modelCallsB > 1 ? " · 含重规划" : ""}</span>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-300 rounded p-3">
          <div className="text-xs text-gray-600">第一次 Act 前等待</div>
          <div className="mt-1 text-sm">A：<b className="text-red-700">{c.preActStepsA}</b> 步</div>
          <div className="text-sm">B：<b className="text-blue-700">{c.preActStepsB}</b> 步</div>
        </div>
        <div className="bg-gray-50 border border-gray-300 rounded p-3">
          <div className="text-xs text-gray-600">计划对象在第一次 Act 前</div>
          <div className="mt-1 text-sm">A：<b className="text-red-700">不存在</b></div>
          <div className="text-sm">B：<b className="text-green-700">存在</b></div>
        </div>
        <div className={"rounded p-3 border " + (c.replannerTriggered ? "bg-yellow-50 border-yellow-300" : "bg-gray-50 border-gray-300")}>
          <div className="text-xs text-gray-600">重规划触发（step-3）</div>
          <div className="mt-1 text-sm">触发：<b className={c.replannerTriggered ? "text-yellow-900" : "text-gray-500"}>{c.replannerTriggered ? "✅ 是" : "❌ 否"}</b></div>
          <div className="text-sm">计划版本数：<b>{c.planVersions}</b>
            <span className="text-gray-400">{c.planVersions > 1 ? "（v1 → v" + c.planVersions + "）" : "（没换 plan）"}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
