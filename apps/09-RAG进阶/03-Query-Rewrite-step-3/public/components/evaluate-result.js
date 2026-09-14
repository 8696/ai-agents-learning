/**
 * 职责：评测结果卡 —— 命中率对照表 + 每题命中详情。
 * 数据流：evalResult.modes[].hitCount / hitRate / perQuestion → 卡片。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  function EvalResultCard(props) {
    const result = props.result;
    if (!result || !result.modes) {
      return <div className="text-sm text-gray-500">还没跑评测。点了之后这里出现命中率对照表 + 每题详情。</div>;
    }
    const modeKeys = Object.keys(result.modes);
    if (modeKeys.length === 0) {
      return <div className="text-sm text-gray-500">评测结果为空：modes 为空。</div>;
    }
    const modes = Object.entries(result.modes);

    // 按 category 分组（聚合 perQuestion 命中详情）
    const grouped = (function () {
      const out = {};
      // 用第一个 mode 做分组基准（保证每题都有分类）
      const refMode = modes[0] ? modes[0][0] : null;
      if (!refMode) return out;
      const ref = result.modes[refMode];
      if (!ref || !Array.isArray(ref.perQuestion)) return out;
      for (const row of ref.perQuestion) {
        if (!out[row.category]) out[row.category] = [];
        out[row.category].push(row);
      }
      return out;
    })();

    // 防御：避免某 mode 缺失时报错
    const originalSummary = result.modes["original"];
    const rewrittenSummary = result.modes["rewritten"];

    return (
      <div className="space-y-4">
        <div className="border rounded p-3 space-y-2 bg-blue-50 border-blue-300">
          <div className="text-sm font-medium text-blue-900">命中率对照（top-{result.topK}）</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-700">
                <th className="py-1 pr-4">检索模式</th>
                <th className="py-1 pr-4">命中数 / 总题数</th>
                <th className="py-1 pr-4">命中率</th>
                <th className="py-1">对照解读</th>
              </tr>
            </thead>
            <tbody>
              {modes.map(function (entry, i) {
                const [mode, summary] = entry;
                const rate = (summary.hitRate * 100).toFixed(1);
                const delta = i > 0 ? (summary.hitRate - modes[i - 1][1].hitRate) * 100 : 0;
                return (
                  <tr key={mode} className="border-t border-blue-200">
                    <td className="py-1 pr-4 font-medium">{mode === "original" ? "原句检索" : "改写检索"}</td>
                    <td className="py-1 pr-4 font-mono">{summary.hitCount} / {summary.total}</td>
                    <td className="py-1 pr-4 font-mono">{rate}%</td>
                    <td className="py-1 text-gray-700">
                      {i === 0 ? "基线" : (delta >= 0 ? "↑ +" : "↓ ") + delta.toFixed(1) + " 个百分点"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-blue-800">
            一次只加一个变量：原句检索是基线、改写检索是"只改检索前改写"这一项的对照。其他开关不动。
          </p>
        </div>

        <div className="border rounded p-3 space-y-3 bg-white">
          <div className="text-sm font-medium">每题命中详情</div>
          {Object.keys(grouped).map(function (category) {
            const rows = grouped[category];
            return (
              <div key={category} className="space-y-1">
                <div className="text-xs font-medium text-gray-700">分类：{category}（{rows.length} 题）</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="py-1 pr-2">题 id</th>
                      <th className="py-1 pr-2">用户原句</th>
                      <th className="py-1 pr-2">期望命中</th>
                      <th className="py-1 pr-2">原句 top-5</th>
                      <th className="py-1 pr-2">改写 top-5</th>
                      <th className="py-1">结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(function (row) {
                      const origHit = originalSummary && Array.isArray(originalSummary.perQuestion)
                        ? originalSummary.perQuestion.find(function (r) { return r.id === row.id; })
                        : null;
                      const rewrHit = rewrittenSummary && Array.isArray(rewrittenSummary.perQuestion)
                        ? rewrittenSummary.perQuestion.find(function (r) { return r.id === row.id; })
                        : null;
                      const origTop5 = origHit && origHit.hitIds ? origHit.hitIds.join(", ") : "—";
                      const rewrTop5 = rewrHit && rewrHit.hitIds ? rewrHit.hitIds.join(", ") : "—";
                      const result = rewrHit ? (rewrHit.hit ? "改写命中 ✓" : "改写未命中 ✗") : "—";
                      return (
                        <tr key={row.id} className="border-t border-gray-200 align-top">
                          <td className="py-1 pr-2 font-mono text-gray-500">{row.id}</td>
                          <td className="py-1 pr-2">{row.query}</td>
                          <td className="py-1 pr-2 font-mono text-gray-700">{row.targetIds.join(", ")}</td>
                          <td className="py-1 pr-2 font-mono text-xs">{origTop5}</td>
                          <td className="py-1 pr-2 font-mono text-xs">{rewrTop5}</td>
                          <td className="py-1 text-xs">{result}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  DemoUI.EvalResultCard = EvalResultCard;
})();