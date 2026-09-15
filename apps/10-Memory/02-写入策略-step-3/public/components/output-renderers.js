/**
 * 职责：把 /api/filter-dimensions /api/filter /api/extract 三种接口的返回渲染到 #output 区。
 * 数据流：mode（dims/filter/extract）+ 三个 result props → 按 mode 渲染对应结果。
 *
 * 把这些渲染从 index.html 内联块抽出来是因为单页 473 行超 §5.3.8 上限 400 行；
 * 拆到 components/ 后内联块只负责状态管理和装配，按职责拆组件。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // 把 verdict 列表按 rejectReason 分桶（用于分四栏展示）
  function bucketByReason(verdicts) {
    const buckets = { PASSED: [], BELOW_THRESHOLD: [], PROGRAMMATIC_RULE: [], SESSION_ONLY: [] };
    (verdicts || []).forEach(function (v) {
      if (v.passed) {
        buckets.PASSED.push(v);
      } else if (v.rejectReason === "BELOW_THRESHOLD") {
        buckets.BELOW_THRESHOLD.push(v);
      } else if (v.rejectReason === "PROGRAMMATIC_RULE") {
        buckets.PROGRAMMATIC_RULE.push(v);
      } else if (v.rejectReason === "SESSION_ONLY") {
        buckets.SESSION_ONLY.push(v);
      }
    });
    return buckets;
  }

  function fmtThreshold(t) { return t.toFixed(2); }

  const { PassedList, RejectedList, FilterSummary, ModelTrace } = DemoUI;

  // /api/filter-dimensions 的渲染：三道闸门的结果分四栏（绿 / 黄 / 橙 / 红）+ 两次模型调用明细
  DemoUI.DimsOutput = function DimsOutput(props) {
    const r = props.result;
    const buckets = bucketByReason(
      [].concat(r.passed, r.rejectedByThreshold, r.rejectedByDimension),
    );
    const dimensionRejected = r.rejectedByDimension || [];
    const byA = dimensionRejected.filter(function (v) { return v.rejectReason === "PROGRAMMATIC_RULE"; }).length;
    const byB = dimensionRejected.filter(function (v) { return v.rejectReason === "SESSION_ONLY"; }).length;
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
            <p className="text-sm font-semibold text-orange-800 mb-2 mt-3">
              第三道 A 拦下（{byA} 条 · 全员规则不进个人库）
            </p>
            <RejectedList items={buckets.PROGRAMMATIC_RULE} />
            <p className="text-sm font-semibold text-red-800 mb-2 mt-3">
              第三道 B 拦下（{byB} 条 · 本轮临时状态）
            </p>
            <RejectedList items={buckets.SESSION_ONLY} />
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
            skipped={!r.enableA && !r.enableB}
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
        这是「只把关（置信度）/ 不判维度」的对照结果——共抽出 <b>{r.originalCount}</b> 条候选，按置信度阈值 <b>{fmtThreshold(r.threshold)}</b> 切完剩 {r.passed.length} 条通过 / {r.rejected.length} 条被拦下。跟「三道闸门」对比就能看见：多加两道维度闸门切掉了什么。
      </div>
    );
  };

  // /api/extract 的渲染：只提取对照（一句话摘要）
  DemoUI.ExtractOutput = function ExtractOutput(props) {
    const r = props.result;
    return (
      <div className="border border-gray-300 bg-gray-50 rounded p-3 text-sm text-gray-700">
        这是「只提取 / 跳过所有把关」的对照结果——共抽出 <b>{r.candidates.length}</b> 条候选，不做任何判定全部进库。跟「把关」+「三道闸门」对比就能看见整条流水线切掉了什么。
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
                  阈值 {fmtThreshold(item.threshold)} · A {item.enableA ? "开" : "关"} / B {item.enableB ? "开" : "关"} ·
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
