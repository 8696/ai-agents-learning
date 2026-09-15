/**
 * 职责：把关判定的逐条候选卡片（绿卡 PASSED / 红卡 REJECTED）+ 通过/拦下两堆列表 + 阈值摘要。
 * 数据流：filter 返回的 passed[] / rejected[] → 逐条渲染 → 摘要块（原始条数 / 通过 / 拦下 / 当前阈值）。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // 类型对应的颜色：语义记忆（脱离场景仍成立）用蓝系，情景记忆（带时间场景）用紫系。
  const TYPE_STYLE = {
    "语义记忆": { badge: "bg-blue-100 text-blue-800" },
    "情景记忆": { badge: "bg-purple-100 text-purple-800" },
  };

  // 单条候选卡片（含把关判定）。
  // 通过：绿色描边 + 右上「PASSED」徽标。拦下：红色描边 + 右上「REJECTED」徽标 + 拦下理由。
  DemoUI.VerdictCard = function VerdictCard(props) {
    const v = props.verdict;
    const c = v.candidate;
    const typeStyle = TYPE_STYLE[c.type] || { badge: "bg-gray-100 text-gray-800" };
    const passed = v.passed;
    const containerCls = passed
      ? "border border-green-300 bg-green-50"
      : "border border-red-300 bg-red-50";
    const verdictBadge = passed
      ? <span className="text-xs px-2 py-0.5 rounded font-semibold bg-green-200 text-green-900">PASSED</span>
      : <span className="text-xs px-2 py-0.5 rounded font-semibold bg-red-200 text-red-900">REJECTED</span>;
    return (
      <div className={"rounded p-3 space-y-1 " + containerCls}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className={"text-xs px-2 py-0.5 rounded font-medium " + typeStyle.badge}>{c.type}</span>
            <span className="text-xs text-gray-700">
              置信度（confidence）：<b>{c.confidence.toFixed(2)}</b>　·　阈值（threshold）：<b>{v.threshold.toFixed(2)}</b>
            </span>
          </span>
          {verdictBadge}
        </div>
        <p className="text-sm font-semibold text-gray-900">{c.value}</p>
        <p className="text-xs text-gray-600">键（key）：<code className="bg-white/70 px-1 rounded">{c.key}</code></p>
        <p className="text-xs text-gray-600">来源（source）：{c.source}</p>
        <p className="text-xs text-gray-600">
          有效期（validUntil）：{c.validUntil ? c.validUntil : "永久有效（没有失效时间线索）"}
        </p>
        {!passed ? (
          <p className="text-xs text-red-800">
            拦下理由（rejectReason）：<b>{v.rejectReason}</b>
            <span className="text-gray-600">　—　confidence {c.confidence.toFixed(2)} 低于阈值 {v.threshold.toFixed(2)}，不写进库。</span>
          </p>
        ) : null}
      </div>
    );
  };

  // 通过的列表（绿卡）。
  DemoUI.PassedList = function PassedList(props) {
    const items = props.items || [];
    if (items.length === 0) {
      return (
        <div className="border border-gray-300 bg-gray-50 rounded p-3 text-sm text-gray-600">
          当前阈值下<b>没有候选通过</b>——要么是抽取阶段就没出候选（空数组是正常结果），要么是所有候选 confidence 都低于阈值。
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {items.map(function (v, idx) {
          return <DemoUI.VerdictCard key={v.candidate.key + "-p-" + idx} verdict={v} />;
        })}
      </div>
    );
  };

  // 拦下的列表（红卡）。
  DemoUI.RejectedList = function RejectedList(props) {
    const items = props.items || [];
    if (items.length === 0) {
      return (
        <div className="border border-gray-300 bg-gray-50 rounded p-3 text-sm text-gray-600">
          当前阈值下<b>没有候选被拦下</b>——所有抽出来的候选 confidence 都达到或超过阈值。
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {items.map(function (v, idx) {
          return <DemoUI.VerdictCard key={v.candidate.key + "-r-" + idx} verdict={v} />;
        })}
      </div>
    );
  };

  // 阈值摘要块：原始条数 / 通过 / 拦下。
  DemoUI.FilterSummary = function FilterSummary(props) {
    const originalCount = props.originalCount;
    const passedCount = props.passedCount;
    const rejectedCount = props.rejectedCount;
    const threshold = props.threshold;
    return (
      <div className="border border-gray-300 bg-white rounded p-3 text-xs text-gray-700 space-y-1">
        <p>
          提取阶段抽出 <b>{originalCount}</b> 条候选　→　置信度阈值 <b>{threshold.toFixed(2)}</b> 下：
          <span className="text-green-700 font-semibold"> 通过 {passedCount} 条</span>　·
          <span className="text-red-700 font-semibold"> 拦下 {rejectedCount} 条</span>
        </p>
        <p className="text-gray-500">
          阈值是工程参数，由产品 / 业务给定；调阈值能直接看见同一候选翻面（PASSED ↔ REJECTED）。
        </p>
      </div>
    );
  };
})();
