/**
 * 职责：Zod 结果卡片 —— parse 成功绿卡 / safeParse 失败红卡 / repair 文本 / transform 输出。
 * 数据流：三个业务端点的 JSON → 对应卡片。
 * 挂载：window.DemoUI.{ ParseResult, RepairResult, TransformResult, ErrorBanner }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  function ParseResult({ data }) {
    var ok = data.parseOk;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <article className={"rounded border p-3 " + (ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50")}>
          <span className="text-xs px-2 py-0.5 rounded bg-white">parse / safeParse.success</span>
          <p className="text-sm mt-2">{ok ? "合法，data 存在" : "不合法，不会抛给调用方（本接口走 safeParse）"}</p>
          {ok && (
            <pre className="whitespace-pre-wrap mt-2 text-xs bg-gray-50 p-2 rounded max-h-32 overflow-auto">
              {JSON.stringify(data.value, null, 2)}
            </pre>
          )}
          {!ok && <p className="text-xs mt-2 text-red-700">{data.parseError}</p>}
        </article>
        <article className="rounded border border-gray-300 bg-white p-3">
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100">safeParse 形状</span>
          <pre className="whitespace-pre-wrap mt-2 text-xs bg-gray-50 p-2 rounded max-h-32 overflow-auto">
            {JSON.stringify(data.safeParse, null, 2)}
          </pre>
          <p className="text-xs text-gray-500 mt-2">
            success=false 时没有 data 字段；true 时没有 error。这是 discriminated union。
          </p>
        </article>
      </div>
    );
  }

  function RepairResult({ data }) {
    if (data.success) {
      return (
        <article className="rounded border border-gray-300 bg-white p-3 space-y-2">
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100">已经合法</span>
          <p className="text-sm text-gray-700">{data.note}</p>
          <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-2 rounded max-h-32 overflow-auto">
            {JSON.stringify(data.data, null, 2)}
          </pre>
        </article>
      );
    }
    return (
      <div className="space-y-3">
        <article className="rounded border border-red-300 bg-red-50 p-3 space-y-1">
          <span className="text-xs px-2 py-0.5 rounded bg-white">issues（path / code / message）</span>
          {data.issues.map(function (row, i) {
            return (
              <p key={i} className="text-xs font-mono">
                {row.path} · {row.code} · {row.message}
              </p>
            );
          })}
        </article>
        <article className="rounded border border-green-300 bg-green-50 p-3 space-y-1">
          <span className="text-xs px-2 py-0.5 rounded bg-white">repair prompt（喂回模型的文本）</span>
          <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-2 rounded max-h-32 overflow-auto">
            {data.repairPrompt}
          </pre>
        </article>
      </div>
    );
  }

  function TransformResult({ data }) {
    return (
      <article className="rounded border border-green-300 bg-green-50 p-3 space-y-1">
        <span className="text-xs px-2 py-0.5 rounded bg-white">transform 之后</span>
        <p className="text-xs text-gray-600">default 补了 action=search；多了 repaired / when。</p>
        <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-2 rounded max-h-32 overflow-auto">
          {JSON.stringify(data.value, null, 2)}
        </pre>
      </article>
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

  window.DemoUI.ParseResult = ParseResult;
  window.DemoUI.RepairResult = RepairResult;
  window.DemoUI.TransformResult = TransformResult;
  window.DemoUI.ErrorBanner = ErrorBanner;
})();
