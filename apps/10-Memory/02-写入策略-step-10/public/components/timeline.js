/**
 * 职责：时间线预览面板 —— 6 条事实 + 各自重要程度 + 到期日 + 跳 N 天后状态。
 * 数据流：{ skipDays, recall, scored } → 算 asOf = now + skipDays → 跟每条 validUntil 比 → 标 ✓/✗/⊘。
 *
 * 为什么单独成文件：用户需要看到「6 条事实是什么 + 各自到期日 + 跳 N 天后状态」对照，不抽组件 recall-decay.html 行数会超 400。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  function factValue(c) {
    if (c.value && typeof c.value === "object" && "value" in c.value) return c.value.value;
    return String(c.value);
  }

  function importanceLabel(level) {
    if (level === "critical") return "永不变";
    if (level === "important") return "重要";
    if (level === "casual") return "一般";
    if (level === "throwaway") return "用完就丢";
    return "未评";
  }

  DemoUI.Timeline = function Timeline(props) {
    const { skipDays, recall, scored } = props;
    if (!recall || !recall.candidates || recall.candidates.length === 0) return null;

    const asOfDate = new Date(Date.now() + skipDays * 86400_000);
    const asOfStr = asOfDate.toISOString().slice(0, 10);

    const scoredMap = {};
    if (scored && scored.results) {
      scored.results.forEach(function (r) { scoredMap[r.key] = r; });
    }

    function status(c) {
      const score = scoredMap[c.key];
      if (score && score.importance === "critical") {
        return { label: "⊘ 永不淘汰", cls: "bg-red-100 text-red-900" };
      }
      if (!c.validUntil) {
        return { label: "⊘ 永不变(没有到期日)", cls: "bg-red-100 text-red-900" };
      }
      if (new Date(c.validUntil).getTime() < asOfDate.getTime()) {
        return { label: "✗ 已过期", cls: "bg-red-100 text-red-900" };
      }
      return { label: "✓ 还在有效期内", cls: "bg-green-100 text-green-900" };
    }

    return (
      <div className="bg-white border rounded p-4 space-y-2">
        <div className="text-sm font-semibold text-gray-800">
          时间线预览（如果时间跳到 {asOfStr} · 跳过 {skipDays} 天后，这 6 条事实分别是什么状态）
        </div>
        <div className="text-xs text-gray-600">
          这是一个<b>实时预览</b>——拖下面「第 4 步」的滑块就看到这一行实时变。点「快进 X 天」才会真的把当前「今天」挪过去 + 把过期的归档。
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-1 pr-2">事实</th>
              <th className="py-1 pr-2">重要程度</th>
              <th className="py-1 pr-2">到期日</th>
              <th className="py-1 pr-2">跳 {skipDays} 天后</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {recall.candidates.map(function (c) {
              const s = status(c);
              const score = scoredMap[c.key];
              const impLevel = score ? score.importance : null;
              return (
                <tr key={c.key}>
                  <td className="py-1 pr-2 text-gray-800">{factValue(c)}</td>
                  <td className="py-1 pr-2">{importanceLabel(impLevel)}{score && score.reasoning ? <span className="text-gray-500">（{score.reasoning}）</span> : null}</td>
                  <td className="py-1 pr-2 font-mono">{c.validUntil ? c.validUntil.slice(0, 10) : "(无)"}</td>
                  <td className="py-1 pr-2"><span className={"px-2 py-0.5 rounded " + s.cls}>{s.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="text-xs text-gray-600">
          说明：⊘ = 模型判定「永不变」或没有到期日 → 跳过任何天数都不会过期；✗ = 已过期 → 快进后会被归档；✓ = 还在有效期内 → 快进后还在库。
        </div>
      </div>
    );
  };
})();