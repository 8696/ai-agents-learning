/**
 * 职责：把服务端切块（Chunk）原样铺开。这是整库，不是召回结果。
 */
(function () {
  const DemoUI = (window.DemoUI = window.DemoUI || {});

  DemoUI.CorpusPanel = function CorpusPanel(props) {
    const chunks = props.chunks || [];
    const loading = props.loading;
    const error = props.error;

    return (
      <section className="bg-white shadow rounded p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">服务端知识库 · 切块（Chunk）</h2>
          <p className="text-xs text-gray-500 mt-1">
            来自 <code>GET /api/corpus</code>。下面每一张卡都是服务端那一份正文，前端没有另写一份。
          </p>
        </div>
        {loading ? <p className="text-xs text-gray-500">正在向服务端要切块…</p> : null}
        {error ? <p className="text-sm text-red-700 bg-red-50 border border-red-300 rounded p-2">{error}</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {chunks.map(function (chunk) {
            return (
              <article
                key={chunk.id}
                className={
                  "rounded border p-3 space-y-2 " +
                  (chunk.shouldCite
                    ? "border-amber-400 bg-amber-50"
                    : "border-gray-200 bg-gray-50")
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">{chunk.title}</div>
                  <code className="text-xs text-gray-500">{chunk.id}</code>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{chunk.text}</p>
                {chunk.shouldCite ? (
                  <p className="text-xs text-amber-800">默认问句该引用的切块（shouldCite）</p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    );
  };
})();
