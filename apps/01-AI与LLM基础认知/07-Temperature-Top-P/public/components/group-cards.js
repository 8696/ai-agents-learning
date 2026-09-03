/**
 * 职责：输出区卡片 —— 一档参数的 GroupResult（几次运行 + 稳定性判定）。
 *
 * 颜色按 §5.3.10 + 本条语义：
 *   STABLE 绿、DIVERGED 黄（协议事件：分叉）、PARTIAL 橙、FAILED 红。
 * 思考标记已在服务端剥掉；卡片展示的是可见答案。
 *
 * 挂载：window.DemoUI.{ GroupCard, SweepResult, RepeatResult, ErrorBanner }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  var VERDICT_CLS = {
    STABLE: "border-green-300 bg-green-50",
    DIVERGED: "border-yellow-300 bg-yellow-50",
    PARTIAL: "border-orange-300 bg-orange-50",
    FAILED: "border-red-300 bg-red-50",
  };

  var VERDICT_PILL = {
    STABLE: "bg-green-200 text-green-800",
    DIVERGED: "bg-yellow-200 text-yellow-800",
    PARTIAL: "bg-orange-200 text-orange-800",
    FAILED: "bg-red-200 text-red-800",
  };

  /** 一档参数一张卡。runs 数组里每次调用一行，失败行用红字。 */
  function GroupCard({ group }) {
    var box = VERDICT_CLS[group.verdict] || "border-gray-300 bg-white";
    var pill = VERDICT_PILL[group.verdict] || "bg-gray-200";
    return (
      <div className={"rounded border p-3 space-y-2 " + box}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{group.label}</span>
          <span className={"text-xs px-2 py-0.5 rounded " + pill}>{group.verdictLabel}</span>
        </div>
        <div className="text-xs text-gray-500">
          temperature={group.temperature} · top_p={group.topP} · 去重后 {group.distinctCount} 种
        </div>
        {group.runs.map(function (run) {
          if (run.error) {
            return (
              <div key={run.index} className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
                第 {run.index} 次失败：{run.error}
              </div>
            );
          }
          return (
            <div key={run.index} className="rounded border border-green-300 bg-green-50 p-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>第 {run.index} 次 · 模型终态</span>
                <span>{run.durationMs} ms</span>
              </div>
              <pre className="whitespace-pre-wrap break-words text-sm max-h-32 overflow-auto">
                {run.text}
              </pre>
            </div>
          );
        })}
      </div>
    );
  }

  function SweepResult({ data }) {
    return (
      <div className="space-y-3">
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <div className="text-xs text-gray-500 mb-1">请求参数</div>
          prompt: {data.prompt}
          <div className="text-xs text-gray-500 mt-1">
            扫描轴 {data.axis} · 固定 {data.fixed.param}={data.fixed.value} · 每档 {data.runsPerGroup} 次 · 总耗时 {data.durationMs} ms
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.groups.map(function (g) {
            return <GroupCard key={g.label} group={g} />;
          })}
        </div>
      </div>
    );
  }

  function RepeatResult({ data }) {
    return (
      <div className="space-y-3">
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <div className="text-xs text-gray-500 mb-1">请求参数</div>
          prompt: {data.prompt}
          <div className="text-xs text-gray-500 mt-1">
            T={data.params.temperature} · top_p={data.params.topP} · 连跑 {data.runs} 次 · {data.durationMs} ms
          </div>
        </div>
        <GroupCard group={data.group} />
      </div>
    );
  }

  function ErrorBanner({ title, detail, httpStatus }) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{title}</span>
          <span className="text-xs text-gray-500">
            {httpStatus ? "HTTP " + httpStatus : "请求未送达"}
          </span>
        </div>
        <div className="text-xs break-words">{detail}</div>
      </div>
    );
  }

  window.DemoUI.GroupCard = GroupCard;
  window.DemoUI.SweepResult = SweepResult;
  window.DemoUI.RepeatResult = RepeatResult;
  window.DemoUI.ErrorBanner = ErrorBanner;
})();
