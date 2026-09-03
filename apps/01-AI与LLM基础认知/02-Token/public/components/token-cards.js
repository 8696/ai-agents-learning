/**
 * 职责：Token 结果卡片 —— 一行对照「字符数 vs Token 数」+ 前 5 个 id。
 * 数据流：encode 接口返回值 → 灰卡（输入）+ 绿卡（切出来的量）。
 * 挂载：window.DemoUI.{ EncodeCard, CompareResult, ErrorBanner }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  function EncodeCard({ title, row }) {
    if (!row) return null;
    return (
      <article className="rounded border border-green-300 bg-green-50 p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-green-100">{title}</span>
          <span className="text-xs text-gray-500">词表 cl100k</span>
        </div>
        <pre className="whitespace-pre-wrap bg-gray-50 text-gray-700 p-2 rounded text-xs max-h-32 overflow-auto">
          prompt: {JSON.stringify(row.text)}
        </pre>
        <p className="text-sm">
          字符数 <span className="font-mono">{row.charCount}</span>
          {" → "}
          Token 数 <span className="font-mono font-semibold">{row.tokenCount}</span>
        </p>
        <p className="text-xs text-gray-500">
          前 5 个 token id：{row.previewIds.join(", ")}
        </p>
      </article>
    );
  }

  function CompareResult({ data }) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <EncodeCard title="英文" row={data.english} />
        <EncodeCard title="中文" row={data.chinese} />
        <p className="md:col-span-2 text-sm text-gray-700">{data.takeaway}</p>
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

  window.DemoUI.EncodeCard = EncodeCard;
  window.DemoUI.CompareResult = CompareResult;
  window.DemoUI.ErrorBanner = ErrorBanner;
})();
