/**
 * 职责：右栏。建库、查看库、SQLite 里每一行四件套。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function StorePanel(props) {
    const JsonBlock = DemoUI.JsonBlock;
    const ingest = props.ingest;
    const store = props.store;
    const busy = props.busy;
    const noKey = props.noKey;
    return (
      <section id="store-pane" className="bg-white shadow rounded p-4 space-y-3 min-h-[200px] border-l-4 border-emerald-700 md:max-h-[calc(100vh-5rem)] md:overflow-y-auto">
        <h2 className="text-sm font-semibold text-gray-900">左边 · 库里有什么（SQLite）</h2>
        <p className="text-xs text-gray-600">建库 POST /api/ingest；查看库 GET /api/store（只 SELECT，不调模型）。</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || noKey}
            onClick={function () { props.onIngest(); }}
            className="bg-emerald-700 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            建库（加载 → 切块 → 向量化 · ingest）
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={function () { props.onStore(); }}
            className="border border-gray-300 px-4 py-2 rounded disabled:opacity-50"
          >
            查看库里有什么（SQLite）
          </button>
        </div>
        <p className="text-xs text-gray-600">期望看见编号 / 向量 / 原文 / 来源。向量开头应是带正负号的小数，不是一串 0。</p>

        {ingest ? (
          <div className="space-y-3">
            <div className="bg-gray-50 text-gray-700 rounded p-3 space-y-1">
              <div className="text-xs font-semibold">请求参数 · 建库 POST /api/ingest</div>
              <p className="text-xs">无请求体。服务端读 knowledge/refund.md。</p>
            </div>
            <div className="border border-gray-300 bg-white rounded p-3 space-y-1">
              <div className="text-xs font-semibold">调用流程 · 建库时三步</div>
              <p className="text-xs text-gray-600">实际跑了：{(ingest.stepsRan || []).join(" → ")}</p>
              <p className="text-xs text-gray-600">加载（Load）：{ingest.load.source} · {ingest.load.charCount} 字</p>
              <p className="text-xs text-gray-600">切块（Chunk）：{ingest.chunks.length} 张卡片，来源都是 {ingest.load.source}</p>
              <p className="text-xs text-gray-600">
                向量化（Embed）：{ingest.embed.vectorCount} 条 × {ingest.embed.dimensions} 维 · 模型 {ingest.embed.model}
              </p>
              <p className="text-xs text-gray-600">约定（prefixRule）：{ingest.embed.prefixRule}</p>
            </div>
            <div className="bg-green-50 border border-green-300 rounded p-3 space-y-2">
              <div className="text-xs font-semibold text-green-900">响应结果 · 一书变成 {ingest.written} 行</div>
              <p className="text-xs text-gray-700">原文摘录：{ingest.load.excerpt}</p>
            </div>
          </div>
        ) : null}

        {store ? (
          <div className="space-y-3">
            <div className="bg-gray-50 text-gray-700 rounded p-3 space-y-1">
              <div className="text-xs font-semibold">请求参数 · 查看库 GET /api/store</div>
              <p className="text-xs">无请求体。只读 data/chunks.db，不调嵌入模型、不调聊天模型。</p>
            </div>
            <div className="border border-gray-300 bg-white rounded p-3 space-y-1">
              <div className="text-xs font-semibold">调用流程 · 从 SQLite SELECT</div>
              <p className="text-xs text-gray-600">引擎 {store.engine} · 文件 {store.dbFile} · 表 {store.table}</p>
              <p className="text-xs text-gray-600">列：{(store.columns || []).join(" / ")}</p>
              <p className="text-xs text-gray-600">磁盘上向量（vector）是 JSON 文本，这里已经转成数字数组。</p>
            </div>
            <div className="bg-green-50 border border-green-300 rounded p-3 space-y-2">
              <div className="text-xs font-semibold text-green-900">
                响应结果 · 库里 {store.rowCount} 行四件套
              </div>
              {store.rowCount === 0 ? (
                <p className="text-xs text-gray-700">还是空表。先点「建库」。</p>
              ) : (
                <ul className="text-xs text-gray-800 space-y-2 max-h-[70vh] overflow-auto">
                  {(store.rows || []).map(function (row) {
                    return (
                      <li key={row.id} className="border rounded p-2 bg-white space-y-1">
                        <div>编号（id）：{row.id}</div>
                        <div>来源（source）{row.source} · 章节（section）{row.section} · 第 {row.chunkIndex} 张</div>
                        <div>原文（text）</div>
                        <pre className="whitespace-pre-wrap max-h-24 overflow-auto">{row.text}</pre>
                        <div>向量（vector）· {Array.isArray(row.vector) ? row.vector.length : 0} 维</div>
                        <JsonBlock value={row.vector} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : (
          ingest ? null : (
            <p className="text-sm text-gray-500">库还没打开。点「建库」或「查看库」。</p>
          )
        )}
      </section>
    );
  }

  DemoUI.StorePanel = StorePanel;
  window.DemoUI = DemoUI;
})();
