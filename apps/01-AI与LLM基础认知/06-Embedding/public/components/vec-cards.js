/**
 * 职责：Embedding 对照卡片 —— Token ID 差值（中性）vs 余弦排序（绿卡）。
 * 数据流：/api/token-id 或 /api/rank 的返回值 → 列表。
 * 挂载：window.DemoUI.{ TokenIdResult, RankResult, ErrorBanner }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  function TokenIdResult({ data }) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-500">查询词 {data.query}（下面差值没有语义）</p>
        {data.rows.map(function (row) {
          return (
            <article key={row.name} className="rounded border border-gray-300 bg-white p-3">
              <div className="flex items-center justify-between text-sm">
                <span>{row.name}</span>
                <span className="text-xs text-gray-500">id {row.id}</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                相对「{data.query}」差值 <span className="font-mono">{row.delta}</span>
              </p>
            </article>
          );
        })}
        <p className="text-sm text-gray-700">{data.takeaway}</p>
      </div>
    );
  }

  function RankResult({ data }) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-500">
          查询「{data.query}」向量 {JSON.stringify(data.queryVector)}
        </p>
        {data.ranked.map(function (row) {
          return (
            <article key={row.name} className="rounded border border-green-300 bg-green-50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span>{row.name}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-green-100">
                  余弦 {row.score.toFixed(3)}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">向量 {JSON.stringify(row.vector)}</p>
            </article>
          );
        })}
        <p className="text-sm text-gray-700">{data.takeaway}</p>
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

  window.DemoUI.TokenIdResult = TokenIdResult;
  window.DemoUI.RankResult = RankResult;
  window.DemoUI.ErrorBanner = ErrorBanner;
})();
