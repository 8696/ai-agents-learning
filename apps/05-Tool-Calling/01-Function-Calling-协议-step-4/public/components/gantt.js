/**
 * 职责：Gantt 时序图组件 —— 把 tool_call 的 startMs/endMs 画成横条；single.html + compare.html 共用。
 *
 * 数据流：parent 传 { title, timeline, totalMs, mode } → 按比例尺渲染色条。
 * 为什么单独成文件：gantt 视觉规则（色板 / 比例尺 / x 轴刻度）跨页一致；改一处生效两页。
 *
 * 教学锚点（§5.3.10/11）：把「并行调用」这一刀变成**可观察行为**——
 *   并行模式：3 个 bar 几乎同时起步（left ≈ 0），总长 = max
 *   串行模式：bar 顺序堆叠（left 累加），总长 = sum
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  // ── 颜色按 tool 名固定（与 §5.3.10 配色一致）──
  var TOOL_PALETTE = {
    search_flight: "bg-blue-400",
    get_weather: "bg-purple-400",
    get_packing_list: "bg-orange-400",
  };

  function GanttChart(props) {
    var title = props.title;
    var timeline = props.timeline || [];
    var totalMs = props.totalMs || 0;
    var mode = props.mode;

    function scale(ms) { return Math.max(0, (ms / Math.max(totalMs, 1)) * 100); }

    return (
      <div className="border border-gray-200 rounded p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <div className="text-xs text-gray-500">
            mode = <code className="bg-gray-100 px-1 rounded">{mode}</code>
            {" · "}总耗时 = <span className="font-mono text-blue-700">{totalMs} ms</span>
          </div>
        </div>
        {/* x 轴刻度（0% / 25% / 50% / 75% / 100%）*/}
        <div className="flex items-end gap-2 pl-44">
          {[0, 0.25, 0.5, 0.75, 1].map(function (p, i) {
            return (
              <div key={i} className="flex-1 text-[10px] text-gray-400 border-l border-gray-200 pl-1">
                {Math.round(totalMs * p)} ms
              </div>
            );
          })}
        </div>
        <div className="space-y-1">
          {timeline.map(function (t) {
            var left = scale(t.startMs);
            var width = Math.max(scale(t.durationMs), 1);
            var bar = TOOL_PALETTE[t.tool] || "bg-gray-400";
            return (
              <div key={t.tool_call_id} className="flex items-center gap-2">
                <div className="w-40 text-xs font-mono text-gray-700 truncate">{t.tool}</div>
                <div className="flex-1 relative h-6 bg-gray-50 rounded">
                  <div
                    className={"absolute top-0 h-6 rounded " + bar + (t.ok ? "" : " opacity-40")}
                    style={{ left: left + "%", width: width + "%" }}
                    title={t.tool + " · " + t.startMs + "ms → " + t.endMs + "ms (" + t.durationMs + "ms)"}
                  ></div>
                </div>
                <div className="w-24 text-[10px] text-gray-500 text-right font-mono">
                  {t.startMs}→{t.endMs}ms
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-500">
          解释：每个色条代表一个 tool_call 的执行区间。颜色 = tool 名；横向位置 = dispatch 开始后的 ms；长度 = 单 handler 耗时。
          并行模式：色条几乎同时起步（left ≈ 0），总长 = max。串行模式：色条顺序堆叠，总长 = sum。
        </p>
      </div>
    );
  }

  // ── 单条 tool_result 卡片（success / reject 两态）──
  function ResultCard(props) {
    var r = props.r;
    var idx = props.idx;
    if (r.ok) {
      return (
        <div className="bg-white border border-green-300 rounded p-3 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs">④-{idx + 1} · tool_result · {r.tool} ✅</span>
            <span className="text-xs px-2 py-0.5 rounded bg-yellow-200 text-yellow-800">tool_result</span>
          </div>
          <pre className="whitespace-pre-wrap text-xs max-h-32 overflow-auto bg-gray-900 text-gray-100 p-2 rounded">
            {JSON.stringify(r.result, null, 2)}
          </pre>
        </div>
      );
    }
    return (
      <div className="bg-red-50 border border-red-300 rounded p-3 text-sm">
        <div className="text-xs font-semibold text-red-800">④-{idx + 1} · {r.tool} ❌ {r.error}</div>
      </div>
    );
  }

  window.DemoUI.GanttChart = GanttChart;
  window.DemoUI.ResultCard = ResultCard;
})();
