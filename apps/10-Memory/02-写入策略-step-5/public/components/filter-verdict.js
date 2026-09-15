/**
 * 职责：把关判定的逐条候选卡片（绿卡 PASSED / 红卡 REJECTED）+ 通过/拦下两堆列表 + 阈值摘要。
 * 数据流：filter 返回的 passed[] / rejected[] → 逐条渲染 → 摘要块（原始条数 / 通过 / 拦下）。
 *
 * step-5 扩展：新增 rejectReason 字符串 `PII_DETECTED`（敏感信息过滤，玫红色徽标），FilterSummary 加 enablePii + byReason.PII_DETECTED。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // 类型对应的颜色：语义记忆（脱离场景仍成立）用蓝系，情景记忆（带时间场景）用紫系。
  const TYPE_STYLE = {
    "语义记忆": { badge: "bg-blue-100 text-blue-800" },
    "情景记忆": { badge: "bg-purple-100 text-purple-800" },
  };

  // 拦下原因对应的徽标颜色（按文档约定的 rejectReason 字符串）
  const REASON_STYLE = {
    BELOW_THRESHOLD: { badge: "bg-yellow-200 text-yellow-900", label: "置信度拦下 · BELOW_THRESHOLD" },
    PII_DETECTED: { badge: "bg-pink-200 text-pink-900", label: "敏感信息拦下 · PII_DETECTED" },
    PROGRAMMATIC_RULE: { badge: "bg-orange-200 text-orange-900", label: "维度 A 拦下 · PROGRAMMATIC_RULE" },
    SESSION_ONLY: { badge: "bg-red-200 text-red-900", label: "维度 B 拦下 · SESSION_ONLY" },
    PUBLIC_KNOWLEDGE: { badge: "bg-fuchsia-200 text-fuchsia-900", label: "维度 C 拦下 · PUBLIC_KNOWLEDGE" },
  };

  // 单条候选卡片（含把关判定）。
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
      : (function () {
          const reason = v.rejectReason || "UNKNOWN";
          const style = REASON_STYLE[reason] || { badge: "bg-red-200 text-red-900", label: "REJECTED · " + reason };
          return <span className={"text-xs px-2 py-0.5 rounded font-semibold " + style.badge}>REJECTED · {style.label}</span>;
        })();
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
          <div className="text-xs space-y-1">
            <p className="text-red-800">
              拦下理由（rejectReason）：<b>{v.rejectReason}</b>
            </p>
            {v.reasoning ? (
              <p className="text-gray-700">
                模型给的解释（reasoning）：<span className="italic">{v.reasoning}</span>
              </p>
            ) : null}
          </div>
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
          当前五道闸门下<b>没有候选通过</b>——要么抽取阶段就没出候选，要么所有候选都被某一道闸门拦下了。
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

  // 拦下的列表（按 rejectReason 着色）。
  DemoUI.RejectedList = function RejectedList(props) {
    const items = props.items || [];
    if (items.length === 0) {
      return (
        <div className="border border-gray-300 bg-gray-50 rounded p-3 text-sm text-gray-600">
          当前五道闸门下<b>没有候选被拦下</b>——所有抽出来的候选 confidence 都达到阈值、且都通过了维度 A / B / C / PII 的判定。
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
    const threshold = props.threshold;
    const enableA = props.enableA;
    const enableB = props.enableB;
    const enableC = props.enableC;
    const enablePii = props.enablePii;
    const byReason = props.byReason || {};
    const lines = [`提取阶段抽出 <b>${originalCount}</b> 条候选　→　置信度阈值 <b>${threshold.toFixed(2)}</b> 下：<span class="text-green-700 font-semibold"> 通过 ${passedCount} 条</span>`];
    const parts = [];
    if (byReason.BELOW_THRESHOLD) parts.push(`<span class="text-yellow-700">${byReason.BELOW_THRESHOLD} 条置信度拦下</span>`);
    if (byReason.PII_DETECTED) parts.push(`<span class="text-pink-700">${byReason.PII_DETECTED} 条敏感信息拦下</span>`);
    if (byReason.PROGRAMMATIC_RULE) parts.push(`<span class="text-orange-700">${byReason.PROGRAMMATIC_RULE} 条维度 A 拦下</span>`);
    if (byReason.SESSION_ONLY) parts.push(`<span class="text-red-700">${byReason.SESSION_ONLY} 条维度 B 拦下</span>`);
    if (byReason.PUBLIC_KNOWLEDGE) parts.push(`<span class="text-fuchsia-700">${byReason.PUBLIC_KNOWLEDGE} 条维度 C 拦下</span>`);
    if (parts.length > 0) {
      lines.push("　·　" + parts.join("　·　"));
    }
    lines.push("");
    lines.push(`维度开关：维度 A「是不是事实」<b>${enableA ? "开" : "关"}</b>　·　维度 B「跨会话还有用吗」<b>${enableB ? "开" : "关"}</b>　·　维度 C「值不值得占存储」<b>${enableC ? "开" : "关"}</b>　·　维度 P「敏感信息」<b>${enablePii ? "开" : "关"}</b>`);
    return (
      <div className="border border-gray-300 bg-white rounded p-3 text-xs text-gray-700 space-y-1">
        <p dangerouslySetInnerHTML={{ __html: lines.join("<br/>") }} />
      </div>
    );
  };
})();
