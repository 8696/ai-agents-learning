/**
 * 职责：顶部对照。只有左栏已跑且右栏已确认执行才显示。
 * 数据流：buildComparison 的结果 → 卡片。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.MetricsStrip = function MetricsStrip(props) {
  const c = props.comparison;
  if (!c) return null;
  return (
    <section id="comparison-strip" className="bg-white shadow rounded p-4 space-y-2">
      <div className="text-sm font-semibold text-gray-800">关键对照（左栏已跑 + 右栏已确认才有数字）</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-gray-50 border border-gray-300 rounded p-3">
          <div className="text-xs text-gray-600">模型调用次数</div>
          <div className="mt-1 text-sm">A：<b className="text-red-700">{c.modelCallsA}</b> / B：<b className="text-green-700">{c.modelCallsB}</b></div>
        </div>
        <div className="bg-gray-50 border border-gray-300 rounded p-3">
          <div className="text-xs text-gray-600">计划对象在第一次 Act 前</div>
          <div className="mt-1 text-sm">A 不存在 / B 存在（已给人看过）</div>
        </div>
        <div className="bg-gray-50 border border-gray-300 rounded p-3">
          <div className="text-xs text-gray-600">计划版本 / 重规划</div>
          <div className="mt-1 text-sm">{c.planVersions} 版 · {c.replannerTriggered ? "触发了重规划" : "没换 plan"}</div>
        </div>
      </div>
    </section>
  );
};
