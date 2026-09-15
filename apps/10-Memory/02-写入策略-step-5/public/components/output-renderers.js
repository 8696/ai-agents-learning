/**
 * 职责：把 /api/filter-dimensions /api/filter /api/extract 三种接口的返回渲染到 #output 区。
 * 数据流：mode（dims/filter/extract）+ 三个 result props → 按 mode 渲染对应结果。
 *
 * step-5 扩展：五道闸门的结果分六栏（绿 / 黄 / 玫红 / 橙 / 红 / 紫）+ 玫红栏接 PII_DETECTED 拒绝原因字符串。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // 把 verdict 列表按 rejectReason 分桶（用于分六栏展示）
  function bucketByReason(verdicts) {
    const buckets = { PASSED: [], BELOW_THRESHOLD: [], PII_DETECTED: [], PROGRAMMATIC_RULE: [], SESSION_ONLY: [], PUBLIC_KNOWLEDGE: [] };
    (verdicts || []).forEach(function (v) {
      if (v.passed) {
        buckets.PASSED.push(v);
      } else if (v.rejectReason === "BELOW_THRESHOLD") {
        buckets.BELOW_THRESHOLD.push(v);
      } else if (v.rejectReason === "PII_DETECTED") {
        buckets.PII_DETECTED.push(v);
      } else if (v.rejectReason === "PROGRAMMATIC_RULE") {
        buckets.PROGRAMMATIC_RULE.push(v);
      } else if (v.rejectReason === "SESSION_ONLY") {
        buckets.SESSION_ONLY.push(v);
      } else if (v.rejectReason === "PUBLIC_KNOWLEDGE") {
        buckets.PUBLIC_KNOWLEDGE.push(v);
      }
    });
    return buckets;
  }

  function fmtThreshold(t) { return t.toFixed(2); }

  const { PassedList, RejectedList, FilterSummary, ModelTrace } = DemoUI;

  // /api/filter-dimensions 的渲染：五道闸门的结果分六栏（绿 / 黄 / 玫红 / 橙 / 红 / 紫）+ 两次模型调用明细
  DemoUI.DimsOutput = function DimsOutput(props) {
    const r = props.result;
    const buckets = bucketByReason(
      [].concat(r.passed, r.rejectedByThreshold, r.rejectedByDimension),
    );
    const dimensionRejected = r.rejectedByDimension || [];
    const byPii = dimensionRejected.filter(function (v) { return v.rejectReason === "PII_DETECTED"; }).length;
    const byA = dimensionRejected.filter(function (v) { return v.rejectReason === "PROGRAMMATIC_RULE"; }).length;
    const byB = dimensionRejected.filter(function (v) { return v.rejectReason === "SESSION_ONLY"; }).length;
    const byC = dimensionRejected.filter(function (v) { return v.rejectReason === "PUBLIC_KNOWLEDGE"; }).length;
    return (
      <div className="space-y-4">
        <FilterSummary
          originalCount={r.originalCount}
          passedCount={r.passed.length}
          rejectedByThresholdCount={r.rejectedByThreshold.length}
          rejectedByDimensionCount={dimensionRejected.length}
          threshold={r.threshold}
          enableA={r.enableA}
          enableB={r.enableB}
          enableC={r.enableC}
          enablePii={r.enablePii}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-semibold text-green-800 mb-2">
              通过（{r.passed.length} 条 · 能写进库）
            </p>
            <PassedList items={buckets.PASSED} />
          </div>
          <div>
            <p className="text-sm font-semibold text-yellow-800 mb-2">
              第二道拦下（{r.rejectedByThreshold.length} 条 · 置信度不够）
            </p>
            <RejectedList items={buckets.BELOW_THRESHOLD} />
            <p className="text-sm font-semibold text-pink-800 mb-2 mt-3">
              第三道 P 拦下（{byPii} 条 · 敏感信息 / 个人身份信息）
            </p>
            <RejectedList items={buckets.PII_DETECTED} />
            <p className="text-sm font-semibold text-orange-800 mb-2 mt-3">
              第三道 A 拦下（{byA} 条 · 全员规则不进个人库）
            </p>
            <RejectedList items={buckets.PROGRAMMATIC_RULE} />
            <p className="text-sm font-semibold text-red-800 mb-2 mt-3">
              第三道 B 拦下（{byB} 条 · 本轮临时状态）
            </p>
            <RejectedList items={buckets.SESSION_ONLY} />
            <p className="text-sm font-semibold text-fuchsia-800 mb-2 mt-3">
              第三道 C 拦下（{byC} 条 · 公开常识 / 随口感慨）
            </p>
            <RejectedList items={buckets.PUBLIC_KNOWLEDGE} />
          </div>
        </div>
        <div className="border border-gray-200 bg-white rounded p-3 text-xs text-gray-600">
          今天的日期（todayBjt）：<b>{r.todayBjt}</b>　·　这次调用耗时：{r.durationMs} ms
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">模型调用明细（两次真发网络请求）</p>
          <ModelTrace
            extractRequest={r.modelRequest}
            extractResponse={r.modelResponse}
            dimensionsRequest={r.dimensionsRequest}
            dimensionsResponse={r.dimensionsResponse}
            skipped={!r.enableA && !r.enableB && !r.enableC && !r.enablePii}
          />
        </div>
      </div>
    );
  };

  // /api/filter 的渲染：纯置信度对照（一句话摘要 + 不画卡片，对照基线）
  DemoUI.FilterOutput = function FilterOutput(props) {
    const r = props.result;
    return (
      <div className="border border-gray-300 bg-gray-50 rounded p-3 text-sm text-gray-700">
        这是「只把关（置信度）/ 不判维度」的对照结果——共抽出 <b>{r.originalCount}</b> 条候选，按置信度阈值 <b>{fmtThreshold(r.threshold)}</b> 切完剩 {r.passed.length} 条通过 / {r.rejected.length} 条被拦下。跟「五道闸门」对比就能看见：多加四道维度闸门切掉了什么。
      </div>
    );
  };

  // /api/extract 的渲染：只提取对照（一句话摘要）
  DemoUI.ExtractOutput = function ExtractOutput(props) {
    const r = props.result;
    return (
      <div className="border border-gray-300 bg-gray-50 rounded p-3 text-sm text-gray-700">
        这是「只提取 / 跳过所有把关」的对照结果——共抽出 <b>{r.candidates.length}</b> 条候选，不做任何判定全部进库。跟「把关」+「五道闸门」对比就能看见整条流水线切掉了什么。
      </div>
    );
  };

  // 把关历史（按时间倒序）
  DemoUI.HistoryList = function HistoryList(props) {
    const items = props.items || [];
    if (items.length === 0) return null;
    return (
      <div className="border-t pt-3">
        <p className="text-sm font-semibold text-gray-800 mb-2">把关历史（按时间倒序）</p>
        <ul className="space-y-2">
          {items.map(function (item, idx) {
            return (
              <li key={idx} className="border border-gray-200 rounded p-2 text-xs text-gray-700">
                <p className="font-medium text-gray-800">原文：{item.text}</p>
                <p className="text-gray-500">
                  阈值 {fmtThreshold(item.threshold)} · A {item.enableA ? "开" : "关"} / B {item.enableB ? "开" : "关"} / C {item.enableC ? "开" : "关"} / P {item.enablePii ? "开" : "关"} ·
                  通过 {item.passed.length} / 置信度拦下 {item.rejectedByThreshold.length} / 维度拦下 {item.rejectedByDimension.length} ·
                  耗时 {item.durationMs} ms
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
})();
