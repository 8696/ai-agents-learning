/**
 * 职责：把关判定的逐条候选卡片（绿卡 PASSED / 红卡 REJECTED / 黄卡 PENDING）+ 通过/待确认/拦下三堆列表 + 摘要。
 * 数据流：filter 返回的 passed[] / pendingConfirmation[] / rejected[] → 逐条渲染 → 摘要块。
 *
 * step-6 扩展：新增 PENDING 档卡片（中档候选项，黄色徽标 + [记住] / [不用] 按钮）。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const TYPE_STYLE = {
    "语义记忆": { badge: "bg-blue-100 text-blue-800" },
    "情景记忆": { badge: "bg-purple-100 text-purple-800" },
  };

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

  // 单条「待确认」卡片（中档候选 + [记住] / [不用] 按钮）。
  DemoUI.PendingConfirmCard = function PendingConfirmCard(props) {
    const entry = props.entry;
    const c = props.candidate;
    const typeStyle = TYPE_STYLE[c.type] || { badge: "bg-gray-100 text-gray-800" };
    const onRemember = props.onRemember;
    const onDrop = props.onDrop;
    return (
      <div className="border border-yellow-300 bg-yellow-50 rounded p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className={"text-xs px-2 py-0.5 rounded font-medium " + typeStyle.badge}>{c.type}</span>
            <span className="text-xs text-gray-700">
              置信度（confidence）：<b>{c.confidence.toFixed(2)}</b>　·　分档区间：midThreshold {entry.midThreshold.toFixed(2)} ≤ conf &lt; highThreshold {entry.highThreshold.toFixed(2)}
            </span>
          </span>
          <span className="text-xs px-2 py-0.5 rounded font-semibold bg-yellow-200 text-yellow-900">PENDING · 待确认</span>
        </div>
        <p className="text-sm font-semibold text-gray-900">{c.value}</p>
        <p className="text-xs text-gray-600">键（key）：<code className="bg-white/70 px-1 rounded">{c.key}</code></p>
        <p className="text-xs text-gray-600">来源（source）：{c.source}</p>
        <p className="text-xs text-gray-600">
          有效期（validUntil）：{c.validUntil ? c.validUntil : "永久有效（没有失效时间线索）"}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className="bg-green-600 text-white text-xs px-3 py-1 rounded hover:bg-green-700"
            onClick={function () { onRemember(entry.id); }}
          >
            [记住]
          </button>
          <button
            type="button"
            className="bg-red-600 text-white text-xs px-3 py-1 rounded hover:bg-red-700"
            onClick={function () { onDrop(entry.id); }}
          >
            [不用]
          </button>
        </div>
      </div>
    );
  };

  // 通过的列表（绿卡）。
  DemoUI.PassedList = function PassedList(props) {
    const items = props.items || [];
    if (items.length === 0) {
      return (
        <div className="border border-gray-300 bg-gray-50 rounded p-3 text-sm text-gray-600">
          当前没有候选通过高档自动写——要么全在中档待确认，要么被置信度 / 维度拦下。
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
          当前没有候选被拦下。
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

  // 待确认的列表（黄卡 + [记住] / [不用] 按钮）。
  DemoUI.PendingList = function PendingList(props) {
    const entries = props.entries || [];
    const candidatesByKey = props.candidatesByKey || {};
    const onRemember = props.onRemember;
    const onDrop = props.onDrop;
    if (entries.length === 0) {
      return (
        <div className="border border-gray-300 bg-gray-50 rounded p-3 text-sm text-gray-600">
          当前没有中档待确认候选——所有过维度的候选要么已自动通过（高档）、要么被低档拦下（已被 step-2 拦掉的）。
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {entries.map(function (entry) {
          // 把 entry 转成 verdict 形态给 PendingConfirmCard 用
          const verdict = {
            candidate: candidatesByKey[entry.key] || {
              key: entry.key,
              value: entry.value,
              type: entry.type,
              confidence: entry.confidence,
              source: "（已在中档待确认，原 candidate 没传回页面）",
              validUntil: null,
            },
            passed: false,
            threshold: entry.midThreshold,
          };
          return (
            <DemoUI.PendingConfirmCard
              key={entry.id}
              entry={entry}
              candidate={verdict.candidate}
              onRemember={onRemember}
              onDrop={onDrop}
            />
          );
        })}
      </div>
    );
  };

  // 阈值摘要块。
  DemoUI.FilterSummary = function FilterSummary(props) {
    const originalCount = props.originalCount;
    const passedCount = props.passedCount;
    const pendingCount = props.pendingCount;
    const midThreshold = props.midThreshold;
    const highThreshold = props.highThreshold;
    const enableA = props.enableA;
    const enableB = props.enableB;
    const enableC = props.enableC;
    const enablePii = props.enablePii;
    const byReason = props.byReason || {};
    const lines = [
      `提取阶段抽出 <b>${originalCount}</b> 条候选　→　置信度阈值 <b>${midThreshold.toFixed(2)}</b> 下：通过 ` +
      `<span class="text-green-700 font-semibold">${passedCount + pendingCount} 条</span>（其中 <span class="text-green-700">高档自动 ${passedCount}</span> / <span class="text-yellow-700">中档待确认 ${pendingCount}</span>）`,
    ];
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
    lines.push(`分档阈值：midThreshold <b>${midThreshold.toFixed(2)}</b> · highThreshold <b>${highThreshold.toFixed(2)}</b>　|　维度开关：维度 A <b>${enableA ? "开" : "关"}</b> · 维度 B <b>${enableB ? "开" : "关"}</b> · 维度 C <b>${enableC ? "开" : "关"}</b> · 维度 P <b>${enablePii ? "开" : "关"}</b>`);
    return (
      <div className="border border-gray-300 bg-white rounded p-3 text-xs text-gray-700 space-y-1">
        <p dangerouslySetInnerHTML={{ __html: lines.join("<br/>") }} />
      </div>
    );
  };
})();