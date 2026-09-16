/**
 * 职责：8-B 审计表里单条 audit 的展示卡 + 撤回按钮。
 * 数据流：接 AuditRow → 7 字段逐行展示 + 撤回按钮 → POST /api/audit/rollback → onRollback(auditId) 回调。
 *
 * 7 字段（按笔记 §0 需求 8 验收 ②）：
 *   1) 时间（created_at）              2) 动作（action · NEW/UPDATE/MERGE/DELETE/NOOP/BLOCKED）
 *   3) 键（key）                       4) 旧值（old_value · JSON）
 *   5) 新值（new_value · JSON）         6) 来源会话+消息序号（source_session_id / source_message_index）
 *   7) 置信度（confidence）
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const ACTION_LABEL = {
    NEW:     { label: "NEW（新增）",       cls: "bg-green-100 text-green-900" },
    UPDATE:  { label: "UPDATE（覆盖）",    cls: "bg-blue-100 text-blue-900" },
    MERGE:   { label: "MERGE（合并）",     cls: "bg-purple-100 text-purple-900" },
    DELETE:  { label: "DELETE（删除）",    cls: "bg-red-100 text-red-900" },
    NOOP:    { label: "NOOP（无操作）",    cls: "bg-gray-100 text-gray-900" },
    BLOCKED: { label: "BLOCKED（已拦下）", cls: "bg-yellow-100 text-yellow-900" },
  };

  function fmt(v) {
    if (v === null || v === undefined) return "（空）";
    if (typeof v === "string") return v;
    return JSON.stringify(v, null, 2);
  }

  DemoUI.AuditRowCard = function AuditRowCard(props) {
    const row = props.row;
    const onRollback = props.onRollback;
    const busy = props.busy;
    const a = ACTION_LABEL[row.action] || { label: row.action, cls: "bg-gray-100 text-gray-900" };
    const rolledBack = Boolean(row.rolled_back_at);
    return (
      <div className={"border rounded p-3 space-y-2 " + (rolledBack ? "bg-gray-50 border-gray-300" : "bg-white border-gray-200")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 font-mono">#{row.id}</span>
          <span className={"text-xs px-2 py-0.5 rounded font-semibold " + a.cls}>{a.label}</span>
          <span className="text-xs text-gray-700 font-mono">{row.key}</span>
          <span className="text-xs text-gray-500">置信度 {row.confidence ?? "—"}</span>
          {rolledBack ? <span className="text-xs px-2 py-0.5 rounded font-semibold bg-gray-300 text-gray-800">已撤回 @ {row.rolled_back_at}</span> : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-50 border rounded p-2">
            <div className="text-gray-500 font-semibold mb-1">旧值（old_value）</div>
            <pre className="text-xs font-mono whitespace-pre-wrap max-h-32 overflow-auto">{fmt(row.old_value)}</pre>
          </div>
          <div className="bg-green-50 border border-green-200 rounded p-2">
            <div className="text-gray-500 font-semibold mb-1">新值（new_value）</div>
            <pre className="text-xs font-mono whitespace-pre-wrap max-h-32 overflow-auto">{fmt(row.new_value)}</pre>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span>时间：<span className="font-mono">{row.created_at}</span></span>
          <span>来源：<span className="font-mono">{row.source_session_id || "—"}#{row.source_message_index ?? "—"}</span></span>
          {row.idempotency_key ? <span>幂等键：<span className="font-mono">{row.idempotency_key}</span></span> : null}
        </div>

        {onRollback && !rolledBack ? (
          <div>
            <button
              onClick={function () { onRollback(row.id); }}
              disabled={busy}
              className="bg-red-600 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
            >
              撤回这次写入
            </button>
            <span className="ml-2 text-xs text-gray-500">点了会按 action 反向恢复事实库 + 标 audit.rolled_back_at</span>
          </div>
        ) : null}
      </div>
    );
  };
})();
