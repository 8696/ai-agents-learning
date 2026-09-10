/**
 * 职责：短任务 vs 长任务的「值不值得规划」对照卡。
 * 数据流：buildComparison 的结果 → 两张卡。缺一组就不渲染那张。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.MetricsStrip = function MetricsStrip(props) {
  const c = props.comparison;
  if (!c) return null;
  function card(pair, label, worth) {
    if (!pair) return null;
    const yes = worth === true;
    return (
      <div className={"rounded p-3 border " + (yes ? "bg-green-50 border-green-300" : "bg-yellow-50 border-yellow-300")}>
        <div className="text-xs text-gray-600">{label}「{pair.task}」</div>
        <div className="mt-1 text-sm">A 一步步走：<b>{pair.a.modelCalls}</b> 圈 · {pair.a.stepCount} 步 · {pair.a.totalMs} ms</div>
        <div className="text-sm">B 先规划：<b>{pair.b.plans}</b> 规划 · {pair.b.stepCount} 步 · {pair.b.totalMs} ms</div>
        <div className="mt-2 text-sm font-semibold">
          值得规划？<b className={yes ? "text-green-700" : "text-yellow-900"}>{yes ? "✅ 是（B 更省模型）" : "❌ NO（B 多付一次）"}</b>
        </div>
      </div>
    );
  }
  return (
    <section id="comparison-grid" className="bg-white shadow rounded p-4 space-y-2">
      <div className="text-sm font-semibold text-gray-800">关键对照（数字来自对应那一次请求，浏览器现场算）</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {card(c.short, "短任务", c.shortWorthReplan)}
        {card(c.long, "长任务", c.longWorthReplan)}
      </div>
    </section>
  );
};
