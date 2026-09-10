/**
 * 职责：顶部三行关键对照（模型调用次数 / 第一次 Act 前等待 / 计划对象）。
 * 数据流：buildComparison 的结果 → 三张卡。没有两侧数据时不渲染。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.MetricsStrip = function MetricsStrip(props) {
  const c = props.comparison;
  if (!c) return null;
  return (
    <section id="comparison-strip" className="bg-white shadow rounded p-4 space-y-2">
      <div className="text-sm font-semibold text-gray-800">关键对照（看差异就看这三行 · 数字来自两次独立请求）</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-gray-50 border border-gray-300 rounded p-3">
          <div className="text-xs text-gray-600">模型调用次数（model calls）</div>
          <div className="mt-1 text-sm">
            <span className="text-gray-700">一步步走 A：</span>
            <b className="text-red-700">{c.modelCallsA}</b>
            <span className="text-gray-400">（每圈 Reason 都调）</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-700">先规划 B：</span>
            <b className="text-green-700">{c.modelCallsB}</b>
            <span className="text-gray-400">（只规划器 1 次 + 执行 0 次）</span>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-300 rounded p-3">
          <div className="text-xs text-gray-600">第一次 Act 前等待（pre-Act steps）</div>
          <div className="mt-1 text-sm">
            <span className="text-gray-700">一步步走 A：</span>
            <b className="text-red-700">{c.preActStepsA}</b>
            <span className="text-gray-400"> 步</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-700">先规划 B：</span>
            <b className="text-blue-700">{c.preActStepsB}</b>
            <span className="text-gray-400"> 步（先规划）</span>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-300 rounded p-3">
          <div className="text-xs text-gray-600">计划作为对象在第一次 Act 前（plan object）</div>
          <div className="mt-1 text-sm">
            <span className="text-gray-700">一步步走 A：</span>
            <b className="text-red-700">不存在</b>
          </div>
          <div className="text-sm">
            <span className="text-gray-700">先规划 B：</span>
            <b className="text-green-700">存在</b>
            <span className="text-gray-400">{c.plannerFallback ? "（⚠ 兜底 mock）" : "（真模型清单）"}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
