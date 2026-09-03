/**
 * 职责：输出区卡片 —— retry 的 attempts 时间线 / burst 聚合 / 页面级错误横幅。
 *
 * 颜色按 §5.3.10：
 *   2xx 绿（终态成功）、429 黄（可重试协议事件）、401/4xx 红（不可重试）、
 *   5xx 红、network 灰（可重试的网络错）。
 *
 * 挂载：window.DemoUI.{ TimelineTable, TimelineBlock, BurstBlock, ErrorBanner, statusClass }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  /** 状态码 → Tailwind；这是时间线每一行的语义色，不要每页自创一套。 */
  function statusClass(s) {
    if (s === "network") return "bg-gray-200 text-gray-800";
    if (typeof s === "number" && s >= 200 && s < 300) return "bg-green-200 text-green-800";
    if (s === 429) return "bg-yellow-200 text-yellow-800";
    if (typeof s === "number" && s >= 500) return "bg-red-200 text-red-800";
    if (s === 401 || s === 403 || s === 400 || s === 404 || s === 422) return "bg-red-200 text-red-800";
    return "bg-gray-100 text-gray-700";
  }

  /**
   * 一张 attempts 表：每一行 = retry 循环里的一次 HTTP。
   * waitBefore ≥ Retry-After 说明「听了服务端的秒数」；同一 attempt 序号 waitBefore 抖动 = jitter。
   */
  function TimelineTable({ attempts }) {
    return (
      <table className="w-full text-xs font-mono mt-2 border border-gray-200">
        <thead className="bg-gray-50 text-gray-700">
          <tr>
            <th className="px-2 py-1 text-left">#</th>
            <th className="px-2 py-1 text-left">status</th>
            <th className="px-2 py-1 text-left">waitBefore</th>
            <th className="px-2 py-1 text-left">Retry-After</th>
            <th className="px-2 py-1 text-left">duration</th>
            <th className="px-2 py-1 text-left">body</th>
          </tr>
        </thead>
        <tbody>
          {(attempts || []).map(function (a) {
            return (
              <tr key={a.attempt} className="border-t border-gray-200">
                <td className="px-2 py-1">#{a.attempt}</td>
                <td className="px-2 py-1">
                  <span className={"text-xs px-2 py-0.5 rounded " + statusClass(a.status)}>{a.status}</span>
                </td>
                <td className="px-2 py-1">{a.waitBeforeMs.toFixed(0)}ms</td>
                <td className="px-2 py-1">{a.retryAfterUsedMs === null ? "—" : a.retryAfterUsedMs + "ms"}</td>
                <td className="px-2 py-1">{a.durationMs.toFixed(0)}ms</td>
                <td className="px-2 py-1">
                  <pre className="whitespace-pre-wrap max-h-32 overflow-auto">
                    {(a.errorMessage || "—").slice(0, 80)}
                  </pre>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  /**
   * 一次 proxy / real 的结果卡。
   * ok=true → 绿卡（模型终态 / mock 200）；ok=false → 红卡（NonRetryable / Exhausted / 其它）。
   */
  function TimelineBlock({ data, label }) {
    var box = data.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50";
    return (
      <div className={"rounded border p-3 " + box}>
        {label ? <div className="text-sm font-semibold mb-1">{label}</div> : null}
        <div className="text-xs text-gray-500 mb-1">
          {data.ok ? (
            <span>最终成功 · result（截断）</span>
          ) : (
            <span>
              {data.errorType || "Error"} · 这张卡对应协议里的失败出口，不是页面崩了
            </span>
          )}
        </div>
        {data.ok ? (
          <pre className="whitespace-pre-wrap text-sm max-h-32 overflow-auto mb-2">
            {(data.result || "").slice(0, 240)}
          </pre>
        ) : (
          <div className="text-sm text-red-700 mb-2">{data.error || ""}</div>
        )}
        <TimelineTable attempts={data.attempts} />
      </div>
    );
  }

  /** burst 聚合：一次成功 / 重试后成功 / 失败 + 每条请求的 lastStatus。 */
  function BurstBlock({ data }) {
    var a = data.aggregate || {};
    return (
      <div className="rounded border border-gray-300 bg-white p-3 space-y-2">
        <div className="text-sm font-semibold">并发 {data.concurrency} · 聚合</div>
        <div className="text-xs text-gray-700">
          <span className="text-green-700">一次成功 {a.okFirstTry}</span>
          {" · "}
          <span>重试后成功 {a.okAfterRetry}</span>
          {" · "}
          <span className="text-red-700">失败 {a.failed}</span>
        </div>
        <div className="text-xs text-gray-500">
          429 = {a.total429} · 5xx = {a.total5xx} · network = {a.totalNetwork} · 总重试 = {a.totalRetries} · 总耗时 ={" "}
          {((a.totalTimeMs || 0) / 1000).toFixed(1)}s
        </div>
        <table className="w-full text-xs font-mono border border-gray-200">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-2 py-1 text-left">结果</th>
              <th className="px-2 py-1 text-left">req#</th>
              <th className="px-2 py-1 text-left">attempts</th>
              <th className="px-2 py-1 text-left">lastStatus</th>
              <th className="px-2 py-1 text-left">totalTime</th>
            </tr>
          </thead>
          <tbody>
            {(data.results || []).map(function (r) {
              var last = (r.attempts && r.attempts[r.attempts.length - 1]) || {};
              var lastStatus = last.status != null ? last.status : "?";
              return (
                <tr key={r.idx} className="border-t border-gray-200">
                  <td className="px-2 py-1">{r.ok ? "✅" : "❌"}</td>
                  <td className="px-2 py-1">#{r.idx}</td>
                  <td className="px-2 py-1">{(r.attempts || []).length}</td>
                  <td className="px-2 py-1">
                    <span className={"text-xs px-2 py-0.5 rounded " + statusClass(lastStatus)}>{lastStatus}</span>
                  </td>
                  <td className="px-2 py-1">{(r.totalTimeMs || 0).toFixed(0)}ms</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  /** 页面级错误：fetch reject / HTTP 4xx 5xx。和单次运行的 ok:false 时间线分开。 */
  function ErrorBanner({ error, envError }) {
    var text = error || envError;
    if (!text) return null;
    return (
      <div className="bg-red-50 border border-red-300 rounded p-3 text-sm text-red-700">{text}</div>
    );
  }

  window.DemoUI.statusClass = statusClass;
  window.DemoUI.TimelineTable = TimelineTable;
  window.DemoUI.TimelineBlock = TimelineBlock;
  window.DemoUI.BurstBlock = BurstBlock;
  window.DemoUI.ErrorBanner = ErrorBanner;
})();
