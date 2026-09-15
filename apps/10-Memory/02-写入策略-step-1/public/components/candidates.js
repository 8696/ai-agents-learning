/**
 * 职责：候选事实清单卡片 + 历史提取记录列表。
 * 数据流：extract 返回的 candidates 数组 → 逐条渲染卡片；history 数组 → 简要列表。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // 类型对应的颜色：语义记忆（脱离场景仍成立）用蓝系，情景记忆（带时间场景）用紫系
  const TYPE_STYLE = {
    "语义记忆": { badge: "bg-blue-100 text-blue-800", border: "border-blue-300 bg-blue-50" },
    "情景记忆": { badge: "bg-purple-100 text-purple-800", border: "border-purple-300 bg-purple-50" },
  };

  DemoUI.CandidateCard = function CandidateCard(props) {
    const c = props.candidate;
    const style = TYPE_STYLE[c.type] || { badge: "bg-gray-100 text-gray-800", border: "border-gray-300 bg-white" };
    return (
      <div className={"border rounded p-3 space-y-1 " + style.border}>
        <div className="flex items-center justify-between">
          <span className={"text-xs px-2 py-0.5 rounded font-medium " + style.badge}>{c.type}</span>
          <span className="text-xs text-gray-500">置信度（confidence）：{c.confidence.toFixed(2)}</span>
        </div>
        <p className="text-sm font-semibold text-gray-900">{c.value}</p>
        <p className="text-xs text-gray-600">键（key）：<code className="bg-white/70 px-1 rounded">{c.key}</code></p>
        <p className="text-xs text-gray-600">来源（source）：{c.source}</p>
        <p className="text-xs text-gray-600">
          有效期（validUntil）：{c.validUntil ? c.validUntil : "永久有效（没有失效时间线索）"}
        </p>
      </div>
    );
  };

  DemoUI.CandidateList = function CandidateList(props) {
    const candidates = props.candidates || [];
    if (candidates.length === 0) {
      return (
        <div className="border border-gray-300 bg-gray-50 rounded p-3 text-sm text-gray-600">
          本次提取抽出 <b>0 条</b>候选事实——这是正常结果，不是出错了。原文里没有值得长期记住的事实性内容（比如纯寒暄、单纯的请求）时，提取函数就应该返回空数组。
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {candidates.map(function (c, idx) {
          return <DemoUI.CandidateCard key={c.key + "-" + idx} candidate={c} />;
        })}
      </div>
    );
  };

  DemoUI.ExtractHistory = function ExtractHistory(props) {
    const items = props.items || [];
    if (items.length === 0) {
      return <p className="text-xs text-gray-500">还没有提取记录。</p>;
    }
    return (
      <ul className="space-y-2">
        {items.map(function (item, idx) {
          return (
            <li key={idx} className="border border-gray-200 rounded p-2 text-xs text-gray-700">
              <p className="font-medium text-gray-800">原文：{item.text}</p>
              <p className="text-gray-500">
                抽出 {item.candidates.length} 条候选 · 今天的日期（todayBjt）：{item.todayBjt} · 耗时 {item.durationMs} ms
              </p>
            </li>
          );
        })}
      </ul>
    );
  };
})();
