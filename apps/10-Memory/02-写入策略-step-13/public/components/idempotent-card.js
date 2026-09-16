/**
 * 职责：8-C 写入幂等结果展示卡。
 * 数据流：接 writeWithIdempotency 返回的 { isDuplicate, audit, action, currentValue, response } →
 * 顶部 isDuplicate=true/false 徽标 + 响应里的 auditId / factKey / factValue + 完整原始 response。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.IdempotentResultCard = function IdempotentResultCard(props) {
    const r = props.result;
    if (!r) return null;
    const dup = r.isDuplicate;
    return (
      <section className={"bg-white shadow rounded p-4 space-y-3 border-l-4 " + (dup ? "border-yellow-500" : "border-green-500")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={"text-xs px-2 py-0.5 rounded font-semibold " + (dup ? "bg-yellow-600 text-white" : "bg-green-600 text-white")}>
            {dup ? "♻️ 命中幂等（isDuplicate = true）" : "🆕 首次写入（isDuplicate = false）"}
          </span>
          {r.audit ? <span className="text-xs text-gray-500 font-mono">audit_id = #{r.audit.id} · action = {r.audit.action}</span> : null}
        </div>

        <div className="bg-gray-50 border rounded p-2 space-y-1 text-xs">
          <div><b>事实键：</b><span className="font-mono">{r.response.factKey || "（空）"}</span></div>
          <div><b>事实值：</b><span className="font-mono break-all">{r.response.factValue === null || r.response.factValue === undefined ? "（空）" : JSON.stringify(r.response.factValue)}</span></div>
          <div><b>auditId：</b><span className="font-mono">{r.response.auditId ?? "—"}</span></div>
        </div>

        {dup ? (
          <div className="bg-yellow-50 border-l-2 border-yellow-400 px-2 py-1 text-xs text-gray-700">
            <b>关键点：</b>同一 idempotencyKey 重复请求 → 服务端不调 kvSet / 不写 audit_log / 不进 idempotency_keys；直接返前次 response 防止库里多一条。
          </div>
        ) : (
          <div className="bg-green-50 border-l-2 border-green-400 px-2 py-1 text-xs text-gray-700">
            <b>关键点：</b>这是该 idempotencyKey 第一次到；kvSet 写入库 + audit_log 写一行 + idempotency_keys 留底。
          </div>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer text-gray-700 font-semibold">📦 完整 response（路由返的 JSON · 用于排查）</summary>
          <pre className="mt-2 text-xs font-mono whitespace-pre-wrap bg-gray-50 border rounded p-2 max-h-72 overflow-auto">{JSON.stringify(r, null, 2)}</pre>
        </details>
      </section>
    );
  };
})();
