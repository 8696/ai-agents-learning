/**
 * 职责：流程跟踪的单个步骤卡 + JSON 安全序列化。
 *       StepCard：标题 + 状态 + 耗时 + 原始请求 / 响应（details 折叠）。
 *       safeJson：避免超长 messages / 大向量撑爆页面（深度上限 2，字符串 200 字符，数组 10 个元素，对象 20 个键）。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  function safeJson(value) {
    function cap(v, depth) {
      if (v === null || v === undefined) return v;
      if (typeof v === "string") return v.length > 200 ? v.slice(0, 200) + "...[+N]" : v;
      if (typeof v !== "object") return v;
      if (depth >= 2) return Array.isArray(v) ? "[Array × " + v.length + "]" : "[Object]";
      if (Array.isArray(v)) return v.slice(0, 10).map(function (x) { return cap(x, depth + 1); });
      const out = {};
      for (const k of Object.keys(v).slice(0, 20)) out[k] = cap(v[k], depth + 1);
      return out;
    }
    try {
      return JSON.stringify(cap(value, 0), null, 2);
    } catch (e) {
      return "<序列化失败: " + e.message + ">";
    }
  }

  function StepCard(props) {
    const title = props.title;
    const status = props.status || "pending";
    const request = props.request;
    const response = props.response;
    const durationMs = props.durationMs;
    const hint = props.hint;
    const statusColor = {
      done: "bg-green-100 text-green-800 border-green-300",
      pending: "bg-gray-100 text-gray-500 border-gray-300",
      error: "bg-red-100 text-red-800 border-red-300",
    }[status] || "bg-gray-100 text-gray-500 border-gray-300";
    const statusLabel = {
      done: "✓ 完成",
      pending: "待执行",
      error: "✗ 失败",
    }[status] || status;
    return (
      <div className={"rounded border p-3 space-y-2 " + statusColor}>
        <div className="flex items-center justify-between text-sm font-medium">
          <span>{title}</span>
          <span className="text-xs">
            {statusLabel}
            {typeof durationMs === "number" ? " · " + durationMs + " ms" : ""}
          </span>
        </div>
        {hint ? <p className="text-xs text-gray-600">{hint}</p> : null}
        {request !== undefined ? (
          <details>
            <summary className="text-xs cursor-pointer text-gray-700">▸ 原始请求（Request）</summary>
            <pre className="mt-1 text-xs bg-white border rounded p-2 overflow-auto max-h-60 whitespace-pre-wrap">
              {typeof request === "string" ? request : safeJson(request)}
            </pre>
          </details>
        ) : null}
        {response !== undefined ? (
          <details>
            <summary className="text-xs cursor-pointer text-gray-700">▸ 原始响应（Response）</summary>
            <pre className="mt-1 text-xs bg-white border rounded p-2 overflow-auto max-h-80 whitespace-pre-wrap">
              {typeof response === "string" ? response : safeJson(response)}
            </pre>
          </details>
        ) : null}
      </div>
    );
  }

  DemoUI.FlowStepCard = StepCard;
  DemoUI.safeJson = safeJson;
})();